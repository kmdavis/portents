import { randomUUID } from "node:crypto";
import { access, chmod, copyFile, lstat, mkdir, open, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { assertValidKey } from "@portents/core";
import { LocalCredentialProvider } from "@portents/identity";
import { createServerApp } from "./app.ts";
import { SqliteStorage } from "./sqlite-storage.ts";

export const DEFAULT_SERVER_HOST = "127.0.0.1";
export const DEFAULT_SERVER_PORT = 7331;
export const DEFAULT_DATA_DIRECTORY = join(homedir(), ".portents");
export const DATABASE_FILENAME = "portents.sqlite";
const installKey = assertValidKey("server/install");

export interface ServerRuntimeOptions {
	readonly dataDir?: string;
	readonly host?: string;
	readonly port?: number;
}

export interface LocalInstallResult {
	readonly dataDir: string;
	readonly principalId: string;
	readonly credential: string;
	readonly endpoint: string;
}

interface InstallationSettings {
	readonly principalId: string;
	readonly host: string;
	readonly port: number;
	readonly credentialId?: string;
}

function dataDirectory(value?: string): string {
	return resolve(value ?? process.env.PORTENTS_DATA_DIR ?? DEFAULT_DATA_DIRECTORY);
}

function endpoint(host: string, port: number): string {
	const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
	return `http://${formattedHost}:${port}`;
}

function configuredHost(host?: string, fallback?: string): string {
	const configured = host ?? process.env.PORTENTS_HOST ?? fallback ?? DEFAULT_SERVER_HOST;
	if (!configured.trim()) throw new TypeError("Server host must be non-empty");
	return configured;
}

function configuredPort(port?: number, fallback?: number): number {
	const configured = port ?? (process.env.PORTENTS_PORT === undefined ? fallback ?? DEFAULT_SERVER_PORT : Number(process.env.PORTENTS_PORT));
	if (!Number.isInteger(configured) || configured < 1 || configured > 65_535) {
		throw new TypeError("Server port must be an integer between 1 and 65535");
	}
	return configured;
}

async function assertInstalled(storage: Pick<SqliteStorage, "read">): Promise<InstallationSettings> {
	const stored = await storage.read(installKey);
	if (stored === undefined) throw new Error("Portents is not installed in this data directory; run `portents-server install` first");
	let installation: unknown;
	try {
		installation = JSON.parse(stored);
	} catch {
		throw new Error("Portents installation metadata is corrupt");
	}
	if (typeof installation !== "object" || installation === null || !("version" in installation) || installation.version !== 1 ||
		!("principalId" in installation) || typeof installation.principalId !== "string" || !/^local-[0-9a-f-]{36}$/.test(installation.principalId) ||
		!("host" in installation) || typeof installation.host !== "string" || !installation.host.trim() ||
		!("port" in installation) || typeof installation.port !== "number" || !Number.isInteger(installation.port) || installation.port < 1 || installation.port > 65_535 ||
		("credentialId" in installation && typeof installation.credentialId !== "string")) {
		throw new Error("Portents installation metadata is corrupt");
	}
	return {
		principalId: installation.principalId,
		host: installation.host,
		port: installation.port,
		...("credentialId" in installation && typeof installation.credentialId === "string" ? { credentialId: installation.credentialId } : {}),
	};
}

async function ensureDataDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
}

/** Create a private data directory and one local principal with a one-time bearer credential. */
export async function installLocalServer(options: ServerRuntimeOptions = {}): Promise<LocalInstallResult> {
	const directory = dataDirectory(options.dataDir);
	const host = configuredHost(options.host);
	const port = configuredPort(options.port);
	await ensureDataDirectory(directory);
	const databasePath = join(directory, DATABASE_FILENAME);
	const storage = new SqliteStorage(databasePath);
	try {
		if (await storage.read(installKey) !== undefined) throw new Error("Portents is already installed in this data directory");
		const principalId = `local-${randomUUID()}`;
		const installed = await storage.transaction(async (transaction) => {
			if (await transaction.read(installKey) !== undefined) throw new Error("Portents is already installed in this data directory");
			const credentials = new LocalCredentialProvider(storage.credentialsFor(transaction));
			const issued = await credentials.issue(principalId);
			await transaction.write(installKey, JSON.stringify({ version: 1, principalId, credentialId: issued.id, host, port }));
			return issued;
		});
		return { dataDir: directory, principalId, credential: installed.credential, endpoint: endpoint(host, port) };
		
	} finally {
		await storage.close();
	}
}

export interface RunningServer {
	readonly host: string;
	readonly port: number;
	close(): Promise<void>;
}

/** Start the same HTTP implementation used for local and self-hosted installs. */
export async function startServer(options: ServerRuntimeOptions = {}): Promise<RunningServer> {
	const directory = dataDirectory(options.dataDir);
	const databasePath = join(directory, DATABASE_FILENAME);
	try {
		await access(databasePath);
	} catch {
		throw new Error("No Portents installation was found; run `portents-server install` first");
	}
	const storage = new SqliteStorage(databasePath);
	let server: ReturnType<typeof serve> | undefined;
	try {
		const installation = await assertInstalled(storage);
		const host = configuredHost(options.host, installation.host);
		const port = configuredPort(options.port, installation.port);
		server = serve({ fetch: createServerApp(storage).fetch, hostname: host, port });
		if (!server.listening) {
			await new Promise<void>((resolveListening, rejectListening) => {
				const onError = (error: Error) => {
					server?.off("listening", onListening);
					rejectListening(error);
				};
				const onListening = () => {
					server?.off("error", onError);
					resolveListening();
				};
				server?.once("error", onError);
				server?.once("listening", onListening);
			});
		}
		let closed = false;
		return {
			host,
			port,
			async close() {
				if (closed) return;
				closed = true;
				try {
					await new Promise<void>((resolveClose, rejectClose) => {
						server!.close((error) => error ? rejectClose(error) : resolveClose());
					});
				} finally {
					await storage.close();
				}
			},
		};
	} catch (error) {
		if (server?.listening) await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
		await storage.close();
		throw error;
	}
}

/** Take a consistent SQLite online backup, including owners and replay receipts. */
export async function backupServer(dataDir: string | undefined, destination: string): Promise<void> {
	const databasePath = join(dataDirectory(dataDir), DATABASE_FILENAME);
	const backupPath = resolve(destination);
	if (backupPath === databasePath) throw new TypeError("Backup destination must differ from the live database");
	await access(databasePath);
	await mkdir(dirname(backupPath), { recursive: true });
	const handle = await open(backupPath, "wx", 0o600);
	await handle.close();
	const storage = new SqliteStorage(databasePath);
	try {
		await assertInstalled(storage);
		await storage.backup(backupPath);
		if (process.platform !== "win32") await chmod(backupPath, 0o600);
	} catch (error) {
		await rm(backupPath, { force: true });
		throw error;
	} finally {
		await storage.close();
	}
}

/** Restore only into a clean directory; stop the server before calling. */
export async function restoreServer(backup: string, dataDir: string | undefined): Promise<void> {
	const directory = dataDirectory(dataDir);
	const databasePath = join(directory, DATABASE_FILENAME);
	for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
		try {
			await lstat(path);
			throw new Error(`Restore destination must be clean: ${path} exists`);
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
		}
	}
	const sourcePath = resolve(backup);
	const source = new SqliteStorage(sourcePath);
	try { await assertInstalled(source); } finally { await source.close(); }
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await copyFile(sourcePath, databasePath, 1);
	if (process.platform !== "win32") await chmod(databasePath, 0o600);
}

export async function rotateLocalCredential(dataDir?: string): Promise<{ principalId: string; credential: string }> {
	const storage = new SqliteStorage(join(dataDirectory(dataDir), DATABASE_FILENAME));
	try {
		return await storage.transaction(async (transaction) => {
			const installation = await assertInstalled(transaction);
			const credentials = new LocalCredentialProvider(storage.credentialsFor(transaction));
			if (installation.credentialId && !(await credentials.revoke(installation.principalId, installation.credentialId))) {
				throw new Error("Installed credential record is missing; credential rotation was not applied");
			}
			const replacement = await credentials.issue(installation.principalId);
			await transaction.write(installKey, JSON.stringify({
				version: 1, principalId: installation.principalId, credentialId: replacement.id,
				host: installation.host, port: installation.port,
			}));
			return { principalId: installation.principalId, credential: replacement.credential };
		});
	} finally { await storage.close(); }
}

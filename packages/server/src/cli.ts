#!/usr/bin/env node
import { parseArgs } from "node:util";
import { installLocalServer, startServer, backupServer, restoreServer, rotateLocalCredential, DEFAULT_SERVER_PORT } from "./runtime.ts";

const usage = `Portents local/self-hosted server

Usage:
  portents-server install [--data-dir PATH] [--host HOST] [--port PORT]
  portents-server start   [--data-dir PATH] [--host HOST] [--port PORT]
  portents-server backup  --destination PATH [--data-dir PATH]
  portents-server restore --source PATH [--data-dir PATH]
  portents-server credential-rotate [--data-dir PATH]

Environment:
  PORTENTS_DATA_DIR  Data directory (default: ~/.portents)
  PORTENTS_HOST      Listen address (default: 127.0.0.1)
  PORTENTS_PORT      Listen port (default: ${DEFAULT_SERVER_PORT})

The install command prints a bearer credential once. If it is lost, use
credential-rotate with local filesystem access; there is no HTTP recovery route.
`;

async function main(argv: readonly string[]): Promise<void> {
	const parsed = parseArgs({
		args: [...argv],
		options: {
			"data-dir": { type: "string" },
			host: { type: "string" },
			port: { type: "string" },
			destination: { type: "string" },
			source: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: true,
	});
	const [command, ...extra] = parsed.positionals;
	if (parsed.values.help || !command || command === "help") {
		if (extra.length) throw new Error("Unexpected positional arguments");
		process.stdout.write(usage);
		return;
	}
	if (extra.length) throw new Error("Unexpected positional arguments");
	const port = parsed.values.port === undefined ? undefined : Number(parsed.values.port);
	if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
		throw new TypeError("--port must be an integer between 1 and 65535");
	}
	const options = {
		...(parsed.values["data-dir"] === undefined ? {} : { dataDir: parsed.values["data-dir"] }),
		...(parsed.values.host === undefined ? {} : { host: parsed.values.host }),
		...(port === undefined ? {} : { port }),
	};
	switch (command) {
		case "install": {
			const installed = await installLocalServer(options);
			process.stdout.write(`Installed in ${installed.dataDir}\n`);
			process.stdout.write(`Endpoint: ${installed.endpoint}\n`);
			process.stdout.write(`Principal: ${installed.principalId}\n`);
			process.stdout.write("Bearer credential (shown once; store securely):\n");
			process.stdout.write(`${installed.credential}\n`);
			return;
		}
		case "start": {
			const server = await startServer(options);
			process.stdout.write(`Portents listening on ${server.host}:${server.port}\n`);
			await new Promise<void>((resolve) => {
				const stop = () => {
					process.off("SIGINT", stop);
					process.off("SIGTERM", stop);
					resolve();
				};
				process.once("SIGINT", stop);
				process.once("SIGTERM", stop);
			});
			await server.close();
			return;
		}
		case "backup": {
			if (!parsed.values.destination) throw new Error("backup requires --destination PATH");
			await backupServer(parsed.values["data-dir"], parsed.values.destination);
			process.stdout.write(`Backup written to ${parsed.values.destination}\n`);
			return;
		}
		case "restore": {
			if (!parsed.values.source) throw new Error("restore requires --source PATH");
			await restoreServer(parsed.values.source, parsed.values["data-dir"]);
			process.stdout.write(`Restored into ${options.dataDir ?? "default data directory"}\n`);
			return;
		}
		case "credential-rotate": {
			const rotated = await rotateLocalCredential(parsed.values["data-dir"]);
			process.stdout.write(`Principal: ${rotated.principalId}\n`);
			process.stdout.write("Bearer credential (store securely):\n");
			process.stdout.write(`${rotated.credential}\n`);
			return;
		}
		default:
			throw new Error(`Unknown command: ${command}\n\n${usage}`);
	}
}

void main(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`portents-server: ${message}\n`);
	process.exitCode = 1;
});

#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const suffix = randomUUID();
const image = `portents-server-smoke:${suffix}`;
const volume = `portents-server-smoke-${suffix}`;
const container = `portents-server-smoke-${suffix}`;

function docker(args, options = {}) {
	const result = spawnSync("docker", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
		...options,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`docker ${args[0]} failed (${result.status}): ${result.stderr.trim()}`);
	}
	return result.stdout;
}

async function command(endpoint, credential, command, metadata = {}) {
	const response = await fetch(`${endpoint}/api/commands`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${credential}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ version: 1, command, ...metadata }),
	});
	const payload = await response.json();
	if (!response.ok || payload.error) {
		throw new Error(`Authenticated ${command.type} request failed (${response.status}): ${payload.error?.code ?? "invalid response"}`);
	}
	return payload;
}

async function waitForServer(endpoint) {
	let lastError;
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const response = await fetch(`${endpoint}/api/commands`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ version: 1, command: { type: "campaign.list" } }),
			});
			if (response.status === 401) return;
			lastError = new Error(`Unauthenticated readiness request returned ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Server did not become ready: ${lastError}`);
}

let credential;
let containerCreated = false;
try {
	docker(["build", "--file", "packages/server/Dockerfile", "--tag", image, "."]);
	docker(["volume", "create", volume]);
	const installOutput = docker([
		"run", "--rm", "--mount", `type=volume,source=${volume},target=/data`,
		"--env", "PORTENTS_DATA_DIR=/data", image, "install",
	]);
	const credentialLine = installOutput.split(/\r?\n/).find((line) => /^[A-Za-z0-9_-]{32,}$/.test(line));
	if (!credentialLine) throw new Error("Install did not emit a one-time bearer credential");
	credential = credentialLine;

	docker([
		"run", "--detach", "--name", container,
		"--mount", `type=volume,source=${volume},target=/data`,
		"--env", "PORTENTS_DATA_DIR=/data", "--env", "PORTENTS_HOST=0.0.0.0",
		"--publish", "127.0.0.1::7331", image, "start",
	]);
	containerCreated = true;
	const published = docker(["port", container, "7331/tcp"]).trim().split(/\r?\n/)[0];
	const port = published?.match(/:(\d+)$/)?.[1];
	if (!port) throw new Error("Docker did not report an ephemeral published port");
	const endpoint = `http://127.0.0.1:${port}`;
	await waitForServer(endpoint);

	const created = await command(endpoint, credential, { type: "campaign.create", name: "Docker smoke campaign", system: "dnd5e" }, { idempotencyKey: randomUUID() });
	const campaignId = created.result?.campaigns?.[0]?.id;
	if (!campaignId) throw new Error("Campaign create returned no campaign ID");
	const before = await command(endpoint, credential, { type: "campaign.list" });
	if (!before.result?.campaigns?.some((campaign) => campaign.id === campaignId)) {
		throw new Error("Created campaign missing from authenticated campaign list");
	}

	docker(["restart", container]);
	await waitForServer(endpoint);
	const after = await command(endpoint, credential, { type: "campaign.list" });
	if (!after.result?.campaigns?.some((campaign) => campaign.id === campaignId)) {
		throw new Error("Campaign did not persist after container restart with the same volume");
	}
	process.stdout.write("Docker smoke passed: native SQLite image, authenticated commands, and volume-backed campaign restart persistence.\n");
} finally {
	credential = undefined;
	if (containerCreated) {
		const stopped = spawnSync("docker", ["rm", "--force", container], { encoding: "utf8" });
		if (stopped.status !== 0) process.stderr.write("Warning: unable to remove smoke-test container.\n");
	}
	for (const [resource, name] of [["volume", volume], ["image", image]]) {
		const removed = spawnSync("docker", [resource, "rm", name], { encoding: "utf8" });
		if (removed.status !== 0) process.stderr.write(`Warning: unable to remove smoke-test ${resource}.\n`);
	}
}

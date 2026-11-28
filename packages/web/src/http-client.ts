import { createCommandClient } from "./client.ts";

export interface HttpCommandClientOptions {
	readonly endpoint: string;
	readonly credential: string;
	readonly fetch?: typeof globalThis.fetch;
}

function commandUrl(endpoint: string): string {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new TypeError("endpoint must be an absolute HTTP(S) URL");
	}
	if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
		throw new TypeError("endpoint must be an HTTP(S) URL without credentials, query, or fragment");
	}
	const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
	const isLoopback = hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" ||
		/^127(?:\.\d{1,3}){3}$/.test(hostname);
	if (url.protocol === "http:" && !isLoopback) {
		throw new TypeError("HTTP command endpoints must use loopback; use HTTPS for network endpoints");
	}
	url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/commands`;
	return url.toString();
}

/** Create an authenticated client for a server implementing the command protocol. */
export function createHttpCommandClient({ endpoint, credential, fetch: fetchImpl = globalThis.fetch }: HttpCommandClientOptions) {
	if (typeof credential !== "string" || credential.length === 0) throw new TypeError("credential must be non-empty");
	if (typeof fetchImpl !== "function") throw new TypeError("fetch is not available");
	const url = commandUrl(endpoint);
	return createCommandClient(async (body) => {
		const response = await fetchImpl(url, {
			method: "POST",
			headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
			body,
		});
		return response.json();
	});
}

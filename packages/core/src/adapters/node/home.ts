/**
 * Where Portents keeps its data on a machine.
 *
 * `$PORTENTS_HOME`, or `~/.portents`. Node-only, because a home directory is not a
 * concept in a browser — the browser adapter keys IndexedDB the same way but has
 * no path to resolve.
 *
 * Deliberately no fallback to the prototype's `~/dnd`. There is exactly one
 * existing user, the migration is a `mv`, and a compatibility shim would outlive
 * its usefulness by years.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { NodeStorage } from "./index.ts";

export const HOME_ENV_VAR = "PORTENTS_HOME";
export const DEFAULT_HOME_DIRNAME = ".portents";

/** The resolved data directory. */
export function portentsHome(env: Record<string, string | undefined> = process.env): string {
	const configured = env[HOME_ENV_VAR]?.trim();
	if (configured) return resolve(configured);
	return join(homedir(), DEFAULT_HOME_DIRNAME);
}

/** Storage rooted at the data directory. The usual entry point on a server or CLI. */
export function openHomeStorage(env?: Record<string, string | undefined>): NodeStorage {
	return new NodeStorage({ root: portentsHome(env) });
}

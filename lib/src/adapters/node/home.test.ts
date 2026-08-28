import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_HOME_DIRNAME, HOME_ENV_VAR, portentHome } from "./home.ts";

describe("portentHome", () => {
	it("defaults to ~/.portent", () => {
		assert.equal(portentHome({}), join(homedir(), ".portent"));
		assert.equal(DEFAULT_HOME_DIRNAME, ".portent");
	});

	it("honours PORTENT_HOME", () => {
		assert.equal(portentHome({ [HOME_ENV_VAR]: "/tmp/portent-test" }), "/tmp/portent-test");
	});

	it("resolves a relative override to an absolute path", () => {
		assert.ok(portentHome({ [HOME_ENV_VAR]: "./data" }).startsWith("/"));
	});

	it("ignores a blank override", () => {
		assert.equal(portentHome({ [HOME_ENV_VAR]: "   " }), join(homedir(), ".portent"));
	});

	it("has no fallback to the prototype's ~/dnd", () => {
		// A deliberate break. One existing user, one mv, no shim to maintain.
		assert.ok(!portentHome({}).endsWith("/dnd"));
	});
});

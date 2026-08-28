import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_HOME_DIRNAME, HOME_ENV_VAR, portentsHome } from "./home.ts";

describe("portentsHome", () => {
	it("defaults to ~/.portents", () => {
		assert.equal(portentsHome({}), join(homedir(), ".portents"));
		assert.equal(DEFAULT_HOME_DIRNAME, ".portents");
	});

	it("honours PORTENTS_HOME", () => {
		assert.equal(portentsHome({ [HOME_ENV_VAR]: "/tmp/portents-test" }), "/tmp/portents-test");
	});

	it("resolves a relative override to an absolute path", () => {
		assert.ok(portentsHome({ [HOME_ENV_VAR]: "./data" }).startsWith("/"));
	});

	it("ignores a blank override", () => {
		assert.equal(portentsHome({ [HOME_ENV_VAR]: "   " }), join(homedir(), ".portents"));
	});

	it("has no fallback to the prototype's ~/dnd", () => {
		// A deliberate break. One existing user, one mv, no shim to maintain.
		assert.ok(!portentsHome({}).endsWith("/dnd"));
	});
});

#!/usr/bin/env node
/**
 * The only part of the CLI that touches a stream or an exit code.
 *
 * Everything else returns a result, which is what lets the tests assert on real
 * output instead of on mocks.
 */

import { run } from "../dist/index.js";

const result = await run(process.argv.slice(2));
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.code);

/**
 * The Storage conformance suite.
 *
 * Every clause of the contract documented in `ports/storage.ts` is checked here,
 * once, so the memory, Node and browser adapters cannot drift apart and so
 * anyone writing a fourth adapter has something to run.
 *
 * Deliberately runner-agnostic: it returns a list of named cases rather than
 * calling `node:test`. Published packages should not force a test runner on
 * their consumers, and a browser adapter has to be exercised under Vitest or a
 * real browser where `node:test` does not exist.
 *
 * ```ts
 * import { describe, it } from "node:test";
 * import { storageConformanceCases } from "@portents/core/testing";
 *
 * describe("my adapter", () => {
 *   for (const c of storageConformanceCases(async () => new MyStorage())) {
 *     it(c.name, () => c.run());
 *   }
 * });
 * ```
 */

import { InvalidKeyError, type Storage } from "../ports/storage.ts";

export interface ConformanceCase {
	readonly name: string;
	run(): Promise<void>;
}

/** Builds a fresh, empty Storage. Called once per case, so cases cannot interfere. */
export type StorageFactory = () => Promise<Storage> | Storage;

/**
 * Properties of the substrate rather than of the adapter.
 *
 * Case sensitivity is the only one so far, and it is genuinely not the adapter's
 * choice: the same {@link NodeStorage} is case-sensitive on ext4 and case-folding
 * on a default macOS APFS volume. The contract requires an adapter never to
 * *normalise* a key; whether the filesystem underneath folds it is a fact about
 * the machine, so the caller declares it and the suite adapts.
 */
export interface StorageCapabilities {
	/**
	 * Whether two keys differing only in case are distinct values. Default true.
	 * Detect it rather than guessing; see `detectCaseSensitivity`.
	 */
	readonly caseSensitive?: boolean;
}

/**
 * Probe whether a store distinguishes keys that differ only by case.
 *
 * Call this once in a test file and feed the answer to
 * {@link storageConformanceCases}, so a case-folding filesystem reports the
 * truth instead of a failure.
 */
export async function detectCaseSensitivity(makeStorage: StorageFactory): Promise<boolean> {
	const store = await makeStorage();
	await store.write("CaseProbe.md", "upper");
	await store.write("caseprobe.md", "lower");
	return (await store.read("CaseProbe.md")) === "upper";
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`Storage contract: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
	if (actual !== expected) {
		throw new Error(
			`Storage contract: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
		);
	}
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a !== b) throw new Error(`Storage contract: ${message}\n  expected: ${b}\n  actual:   ${a}`);
}

async function assertRejects(run: () => Promise<unknown>, message: string): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error(`Storage contract: ${message}`);
}

const INVALID_KEYS: Array<[key: string, why: string]> = [
	["", "the empty string"],
	["/leading", "a leading slash"],
	["trailing/", "a trailing slash"],
	["double//slash", "an empty segment"],
	["..", "a bare traversal segment"],
	["a/../b", "an interior traversal segment"],
	["a/./b", "a bare current-directory segment"],
	["back\\slash", "a backslash"],
	["nul\0byte", "a NUL byte"],
	["spa ce", "a space in a segment"],
	["a/b*c", "a wildcard character"],
	[`${"x".repeat(256)}`, "a segment over 255 characters"],
];

/** Every case in the contract. Pass a factory that returns a fresh empty store. */
export function storageConformanceCases(
	makeStorage: StorageFactory,
	capabilities: StorageCapabilities = {},
): ConformanceCase[] {
	const caseSensitive = capabilities.caseSensitive ?? true;

	/** Each case gets its own empty store, so cases cannot interfere. */
	const store = (run: (store: Storage) => Promise<void>) => async () => {
		await run(await makeStorage());
	};

	return [
		{
			name: "read returns undefined for a missing key rather than throwing",
			run: store(async (s) => {
				assertEqual(await s.read("missing.md"), undefined, "absent key should read as undefined");
				assertEqual(await s.read("deep/missing.md"), undefined, "absent nested key should read as undefined");
			}),
		},
		{
			name: "write then read returns the exact bytes",
			run: store(async (s) => {
				await s.write("a.md", "hello");
				assertEqual(await s.read("a.md"), "hello", "round trip changed the value");
			}),
		},
		{
			name: "write preserves trailing newlines and whitespace",
			run: store(async (s) => {
				const value = "line\n\n  indented  \n";
				await s.write("w.md", value);
				assertEqual(await s.read("w.md"), value, "trailing whitespace was altered");
			}),
		},
		{
			name: "write preserves non-ASCII and astral-plane characters",
			run: store(async (s) => {
				const value = "café · dwarf ᚦ · 🎲🐉 · \u0000not-a-nul-in-value";
				await s.write("u.md", value.replace("\u0000", ""));
				assertEqual(await s.read("u.md"), value.replace("\u0000", ""), "UTF-8 was mangled");
			}),
		},
		{
			name: "write preserves the empty string, which is not the same as absent",
			run: store(async (s) => {
				await s.write("e.md", "");
				assertEqual(await s.read("e.md"), "", "empty value read back as something else");
				assertEqual(await s.exists("e.md"), true, "empty value should still exist");
			}),
		},
		{
			name: "write replaces the whole value rather than merging",
			run: store(async (s) => {
				await s.write("r.md", "first value, longer");
				await s.write("r.md", "second");
				assertEqual(await s.read("r.md"), "second", "write did not replace cleanly");
			}),
		},
		{
			name: "write creates intermediate structure for a nested key",
			run: store(async (s) => {
				await s.write("camp/characters/hero.md", "sheet");
				assertEqual(await s.read("camp/characters/hero.md"), "sheet", "nested write failed");
			}),
		},
		{
			name: "append creates the key when it is absent",
			run: store(async (s) => {
				await s.append("j.md", "first\n");
				assertEqual(await s.read("j.md"), "first\n", "append did not create the key");
			}),
		},
		{
			name: "append adds to the end, in order",
			run: store(async (s) => {
				await s.append("j.md", "one\n");
				await s.append("j.md", "two\n");
				await s.append("j.md", "three\n");
				assertEqual(await s.read("j.md"), "one\ntwo\nthree\n", "append order or content is wrong");
			}),
		},
		{
			name: "append after write extends rather than replacing",
			run: store(async (s) => {
				await s.write("j.md", "header\n");
				await s.append("j.md", "body\n");
				assertEqual(await s.read("j.md"), "header\nbody\n", "append clobbered the existing value");
			}),
		},
		{
			name: "exists reflects writes and removals",
			run: store(async (s) => {
				assertEqual(await s.exists("x.md"), false, "absent key should not exist");
				await s.write("x.md", "v");
				assertEqual(await s.exists("x.md"), true, "written key should exist");
				await s.remove("x.md");
				assertEqual(await s.exists("x.md"), false, "removed key should not exist");
			}),
		},
		{
			name: "list returns matching keys in lexicographic order",
			run: store(async (s) => {
				for (const key of ["b/2.md", "a/1.md", "b/10.md", "b/1.md", "c.md"]) await s.write(key, "v");
				assertDeepEqual(await s.list("b/"), ["b/1.md", "b/10.md", "b/2.md"], "list order is not lexicographic");
			}),
		},
		{
			name: "list with an empty prefix returns everything",
			run: store(async (s) => {
				for (const key of ["z.md", "a/b.md", "m.md"]) await s.write(key, "v");
				assertDeepEqual(await s.list(""), ["a/b.md", "m.md", "z.md"], "empty prefix should list all keys");
			}),
		},
		{
			name: "list matches the prefix literally, not as a directory",
			run: store(async (s) => {
				await s.write("grimhold/journal.md", "v");
				await s.write("grimhold-two/journal.md", "v");
				assertDeepEqual(
					await s.list("grim"),
					["grimhold-two/journal.md", "grimhold/journal.md"],
					"prefix should be a literal string match",
				);
				assertDeepEqual(await s.list("grimhold/"), ["grimhold/journal.md"], "trailing slash should scope to one directory");
			}),
		},
		{
			name: "list is empty for a prefix that matches nothing",
			run: store(async (s) => {
				await s.write("a.md", "v");
				assertDeepEqual(await s.list("nope"), [], "non-matching prefix should list nothing");
			}),
		},
		{
			name: "list does not report removed keys",
			run: store(async (s) => {
				await s.write("a.md", "v");
				await s.write("b.md", "v");
				await s.remove("a.md");
				assertDeepEqual(await s.list(""), ["b.md"], "removed key still listed");
			}),
		},
		{
			name: "remove is idempotent and does not throw for a missing key",
			run: store(async (s) => {
				await s.remove("never-existed.md");
				await s.write("g.md", "v");
				await s.remove("g.md");
				await s.remove("g.md");
				assertEqual(await s.exists("g.md"), false, "double remove should leave the key absent");
			}),
		},
		{
			name: caseSensitive
				? "keys differing only in case are distinct values"
				: "keys differing only in case may collide, but are never normalised",
			run: store(async (s) => {
				await s.write("Case.md", "upper");
				if (caseSensitive) {
					await s.write("case.md", "lower");
					assertEqual(await s.read("Case.md"), "upper", "case-sensitivity lost on read");
					assertEqual(await s.read("case.md"), "lower", "case-sensitivity lost on read");
					return;
				}
				// Case-folding substrate. Collision is permitted; silently rewriting
				// the caller's key is not, so the key must come back as written.
				assertEqual(await s.read("Case.md"), "upper", "a written key must read back, whatever the substrate does");
				assertDeepEqual(await s.list(""), ["Case.md"], "the key was normalised rather than preserved");
			}),
		},
		{
			name: "invalid keys are rejected on every method",
			run: store(async (s) => {
				for (const [key, why] of INVALID_KEYS) {
					const error = await assertRejects(
						() => Promise.resolve(s.read(key)),
						`read should reject ${why} (${JSON.stringify(key)})`,
					);
					assert(error instanceof InvalidKeyError, `read should throw InvalidKeyError for ${why}, threw ${error}`);
					await assertRejects(() => Promise.resolve(s.write(key, "v")), `write should reject ${why}`);
					await assertRejects(() => Promise.resolve(s.append(key, "v")), `append should reject ${why}`);
					await assertRejects(() => Promise.resolve(s.exists(key)), `exists should reject ${why}`);
					await assertRejects(() => Promise.resolve(s.remove(key)), `remove should reject ${why}`);
				}
			}),
		},
		{
			name: "a large value round-trips intact",
			run: store(async (s) => {
				const value = `${"x".repeat(400_000)}\nend\n`;
				await s.write("big.md", value);
				const read = await s.read("big.md");
				assertEqual(read?.length, value.length, "large value changed length");
				assertEqual(read, value, "large value changed content");
			}),
		},
		{
			name: "concurrent writes may lose an update but must never tear a value",
			run: store(async (s) => {
				// v0 assumes a single writer, so a lost update is acceptable.
				// A partial or interleaved value never is.
				const a = "a".repeat(20_000);
				const b = "b".repeat(20_000);
				await Promise.all([s.write("race.md", a), s.write("race.md", b)]);
				const value = await s.read("race.md");
				assert(value === a || value === b, "concurrent write produced a torn value");
			}),
		},
		{
			name: "a reader never observes a partial write",
			run: store(async (s) => {
				const first = "1".repeat(50_000);
				const second = "2".repeat(50_000);
				await s.write("atomic.md", first);
				const write = s.write("atomic.md", second);
				const reads = await Promise.all([s.read("atomic.md"), s.read("atomic.md"), s.read("atomic.md")]);
				await write;
				for (const value of reads) {
					assert(value === first || value === second, "read observed a partially written value");
				}
			}),
		},
	];
}

/** Case names, for a test that asserts the suite has not silently shrunk. */
export function storageConformanceCaseNames(capabilities: StorageCapabilities = {}): string[] {
	const noop: Storage = {
		read: async () => undefined,
		write: async () => {},
		append: async () => {},
		exists: async () => false,
		list: async () => [],
		remove: async () => {},
	};
	return storageConformanceCases(() => noop, capabilities).map((c) => c.name);
}

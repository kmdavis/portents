/**
 * A very small argument parser.
 *
 * Deliberately not a dependency. The CLI has a handful of flags, all of them
 * `--name value` or `--flag`, and a parser generic enough to be worth installing
 * would be larger than this file.
 *
 * Unknown flags are an **error**, not ignored: a typo in `--seed` would otherwise
 * silently generate a different dungeon and look like the tool misbehaving.
 */

export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

export interface FlagSpec {
	/** Flags that take a value. */
	readonly value?: readonly string[];
	/** Flags that are booleans. */
	readonly boolean?: readonly string[];
}

export interface ParsedArgs {
	readonly positional: string[];
	readonly flags: Record<string, string | true>;
}

export function parseArgs(argv: readonly string[], spec: FlagSpec = {}): ParsedArgs {
	const takesValue = new Set(spec.value ?? []);
	const isBoolean = new Set(spec.boolean ?? []);
	const positional: string[] = [];
	const flags: Record<string, string | true> = {};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--") {
			positional.push(...argv.slice(i + 1));
			break;
		}
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}

		const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
		if (takesValue.has(name)) {
			const value = inline ?? argv[++i];
			if (value === undefined) throw new UsageError(`--${name} needs a value`);
			flags[name] = value;
			continue;
		}
		if (isBoolean.has(name)) {
			if (inline !== undefined) throw new UsageError(`--${name} does not take a value`);
			flags[name] = true;
			continue;
		}
		const known = [...takesValue, ...isBoolean].sort();
		throw new UsageError(
			`Unknown flag --${name}${known.length > 0 ? `. Known: ${known.map((f) => `--${f}`).join(", ")}` : ""}`,
		);
	}
	return { positional, flags };
}

/** A flag's value as an integer, with a range check that names the flag. */
export function intFlag(
	flags: Record<string, string | true>,
	name: string,
	options: { min?: number; max?: number; default?: number } = {},
): number | undefined {
	const raw = flags[name];
	if (raw === undefined) return options.default;
	if (raw === true) throw new UsageError(`--${name} needs a value`);
	if (!/^-?\d+$/.test(raw.trim())) throw new UsageError(`--${name} must be a whole number, got ${JSON.stringify(raw)}`);
	const value = Number.parseInt(raw, 10);
	if (options.min !== undefined && value < options.min) {
		throw new UsageError(`--${name} must be at least ${options.min}, got ${value}`);
	}
	if (options.max !== undefined && value > options.max) {
		throw new UsageError(`--${name} must be at most ${options.max}, got ${value}`);
	}
	return value;
}

export function stringFlag(flags: Record<string, string | true>, name: string): string | undefined {
	const raw = flags[name];
	if (raw === undefined) return undefined;
	if (raw === true) throw new UsageError(`--${name} needs a value`);
	return raw;
}

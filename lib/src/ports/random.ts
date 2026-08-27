/**
 * RandomSource — where every die, shuffle and generated map gets its entropy.
 *
 * Two implementations ship: a crypto-backed one for real play and a seeded one
 * for maps and tests. Both are synchronous, because the engine is synchronous.
 *
 * `defaultRandomSource()` uses Web Crypto via `globalThis.crypto`, which exists
 * in Node 18+ and every browser released this decade. That is the whole reason
 * the core needs no adapter for randomness: there is one API on both targets.
 *
 * Every function that consumes randomness takes the source as an argument. The
 * global is read once, at the boundary, and never reached for inside engine
 * logic — otherwise a test could not make a roll deterministic.
 */

/** A source of uniform randomness. */
export interface RandomSource {
	/** Uniform integer in `[min, max]`, inclusive. Throws if `max < min`. */
	int(min: number, max: number): number;
	/** Uniform float in `[0, 1)`. */
	float(): number;
	/** Uniform choice. Throws on an empty array. */
	pick<T>(items: readonly T[]): T;
	/** Fisher-Yates copy. Does not mutate the input. */
	shuffle<T>(items: readonly T[]): T[];
	/** Weighted choice. Weights must sum to more than zero; negatives count as zero. */
	weighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
}

/** Build a full RandomSource from a `[0, 1)` float generator. */
export function randomSourceFrom(float: () => number): RandomSource {
	const int = (min: number, max: number): number => {
		if (!Number.isFinite(min) || !Number.isFinite(max)) {
			throw new RangeError(`int: bounds must be finite, got [${min}, ${max}]`);
		}
		if (max < min) throw new RangeError(`int: max (${max}) is below min (${min})`);
		return min + Math.floor(float() * (max - min + 1));
	};

	return {
		int,
		float,
		pick(items) {
			if (items.length === 0) throw new RangeError("pick: empty array");
			return items[int(0, items.length - 1)];
		},
		shuffle(items) {
			const out = [...items];
			for (let i = out.length - 1; i > 0; i--) {
				const j = int(0, i);
				[out[i], out[j]] = [out[j], out[i]];
			}
			return out;
		},
		weighted(items, weightOf) {
			if (items.length === 0) throw new RangeError("weighted: empty array");
			let total = 0;
			for (const item of items) total += Math.max(0, weightOf(item));
			if (total <= 0) throw new RangeError("weighted: total weight must be greater than zero");
			let target = float() * total;
			for (const item of items) {
				target -= Math.max(0, weightOf(item));
				if (target < 0) return item;
			}
			return items[items.length - 1];
		},
	};
}

/**
 * The Web Crypto object, or a clear error saying what to do about its absence.
 * Isolated here so exactly one place in the library reads a global.
 */
function webCrypto(): Crypto {
	const candidate = (globalThis as { crypto?: Crypto }).crypto;
	if (!candidate || typeof candidate.getRandomValues !== "function") {
		throw new Error(
			"No Web Crypto available. globalThis.crypto.getRandomValues is required for unseeded randomness " +
				"(Node 18+ or any modern browser). Pass an explicit RandomSource if you are somewhere exotic.",
		);
	}
	return candidate;
}

/**
 * Crypto-backed randomness, unbiased.
 *
 * `int` uses rejection sampling over whole 32-bit words rather than a modulo of
 * a float, so a d100 is not very slightly more likely to roll low.
 */
export function cryptoRandomSource(): RandomSource {
	const crypto = webCrypto();
	const buffer = new Uint32Array(1);
	const next = (): number => {
		crypto.getRandomValues(buffer);
		return buffer[0];
	};

	const base = randomSourceFrom(() => next() / 0x1_0000_0000);
	return {
		...base,
		int(min: number, max: number): number {
			if (!Number.isFinite(min) || !Number.isFinite(max)) {
				throw new RangeError(`int: bounds must be finite, got [${min}, ${max}]`);
			}
			if (max < min) throw new RangeError(`int: max (${max}) is below min (${min})`);
			const range = max - min + 1;
			if (range === 1) return min;
			if (range > 0x1_0000_0000) return base.int(min, max);
			// Discard the tail that would skew the distribution.
			const limit = 0x1_0000_0000 - (0x1_0000_0000 % range);
			let value = next();
			while (value >= limit) value = next();
			return min + (value % range);
		},
	};
}

let cached: RandomSource | undefined;

/** The process-wide crypto-backed source, built on first use. */
export function defaultRandomSource(): RandomSource {
	cached ??= cryptoRandomSource();
	return cached;
}

/** Hash a string seed to a 32-bit integer (xmur3). */function hashSeed(seed: string): number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	h = Math.imul(h ^ (h >>> 16), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic randomness from a string seed (mulberry32). The same seed always
 * produces the same sequence, on any platform, forever — which is what lets a
 * map be stored as a seed word instead of a grid.
 */
export function seededRandomSource(seed: string): RandomSource {
	let state = hashSeed(seed);
	return randomSourceFrom(() => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
	});
}

/** A pronounceable seed word, for when the caller has not supplied one. */
export function randomSeed(source: RandomSource = defaultRandomSource()): string {
	const onsets = ["br", "dr", "gr", "kr", "th", "sh", "v", "m", "n", "t", "k", "z", "gl", "fl"];
	const vowels = ["a", "e", "i", "o", "u", "ae", "ei", "ou"];
	const codas = ["n", "r", "l", "th", "sk", "rn", "ld", "m", "x", "st"];
	let out = "";
	for (let i = 0; i < 2; i++) {
		out += source.pick(onsets) + source.pick(vowels) + source.pick(codas);
	}
	return out;
}

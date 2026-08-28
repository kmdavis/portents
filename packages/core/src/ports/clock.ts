/**
 * Clock — the only source of "now".
 *
 * Journal entries, ledger records and deck shuffle stamps are all timestamped,
 * and a test that cannot control the clock cannot assert on them. Injecting a
 * clock costs one optional argument and buys deterministic fixtures.
 */

export interface Clock {
	now(): Date;
	/** ISO 8601, the form written to disk. */
	iso(): string;
}

export const systemClock: Clock = {
	now: () => new Date(),
	iso: () => new Date().toISOString(),
};

/** A clock frozen at one instant. */
export function fixedClock(at: Date | string): Clock {
	const instant = typeof at === "string" ? new Date(at) : at;
	if (Number.isNaN(instant.getTime())) throw new RangeError(`fixedClock: invalid date ${String(at)}`);
	return {
		now: () => new Date(instant.getTime()),
		iso: () => instant.toISOString(),
	};
}

/** A clock that advances by `stepMs` on every read. Useful for ordering assertions. */
export function tickingClock(start: Date | string, stepMs = 1000): Clock {
	let current = (typeof start === "string" ? new Date(start) : start).getTime();
	if (Number.isNaN(current)) throw new RangeError(`tickingClock: invalid date ${String(start)}`);
	const advance = () => {
		const value = new Date(current);
		current += stepMs;
		return value;
	};
	return {
		now: advance,
		iso: () => advance().toISOString(),
	};
}

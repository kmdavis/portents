/**
 * Terminal output: colour when a person is watching, plain when they are not.
 *
 * Every command can be piped, so nothing here may write escape codes into a
 * stream that is being read by another program. The check is `isTTY` plus the
 * `NO_COLOR` convention, and it is made once at import.
 */

const enabled =
	process.stdout.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== "dumb";

function wrap(open: string, close: string) {
	return (text: string) => (enabled ? `${open}${text}${close}` : text);
}

export const bold = wrap("\u001B[1m", "\u001B[22m");
export const dim = wrap("\u001B[2m", "\u001B[22m");
export const green = wrap("\u001B[32m", "\u001B[39m");
export const red = wrap("\u001B[31m", "\u001B[39m");
export const yellow = wrap("\u001B[33m", "\u001B[39m");
export const cyan = wrap("\u001B[36m", "\u001B[39m");

export const colourEnabled = enabled;

/** Strip the markdown emphasis the library emits, since a terminal is not markdown. */
export function plain(text: string): string {
	return text
		.replace(/\*\*(.+?)\*\*/g, (_, inner) => bold(inner))
		.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, inner) => dim(inner))
		// The library also emits _underscore_ emphasis, which was printing literally.
		.replace(/(?<![A-Za-z0-9_])_(?!_)([^_\n]+?)_(?![A-Za-z0-9_])/g, (_, inner) => dim(inner))
		.replace(/`(.+?)`/g, (_, inner) => cyan(inner));
}

export function table(rows: Array<readonly [string, string]>): string {
	const width = rows.reduce((widest, [key]) => Math.max(widest, key.length), 0);
	return rows.map(([key, value]) => `  ${key.padEnd(width)}  ${dim(value)}`).join("\n");
}

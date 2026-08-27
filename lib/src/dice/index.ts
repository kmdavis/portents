/**
 * dice.ts — Foundry-VTT-compatible dice expression engine.
 *
 * Grown from two earlier implementations (xuartlek-foundry/bazaar/packages/dice
 * and ye-olde-shoppe/src/util/dice.ts). The parser here is a full recursive
 * descent one rather than the additive-only split of those versions, so
 * `floor((2d6+3)/2)*2` works.
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('-' | '+') unary | atom
 *   atom    := number | dieGroup | '(' expr ')' | fn '(' expr (',' expr)* ')'
 *   dieGroup := [count] 'd' sides modifier*
 *
 * Dice:
 *   NdX          N dice with X sides (N defaults to 1)
 *   Nd%          percentile dice (d100)
 *   NdF / NdFudge  Fudge/Fate dice, values -1..1
 *
 * Modifiers:
 *   kh<n> kl<n>  keep highest / lowest n (default 1)
 *   dh<n> dl<n>  drop highest / lowest n (default 1)
 *   r<cond>      reroll once on condition
 *   rr<cond>     reroll recursively on condition
 *   x<cond>      explode on condition (default: max face)
 *   xo<cond>     explode once on condition
 *   min<n>       treat any result below n as n
 *   max<n>       treat any result above n as n
 *   cs<cond>     count successes (group value becomes the count)
 *   cf<cond>     count failures
 *
 * Conditions: >, <, >=, <=, = or a bare number (= implied).
 *
 * Comments: everything after '#' is a label, e.g. `1d20+5 # perception`.
 *
 * Repeats: a leading `N#` or `Nx` rolls the whole expression N independent
 * times, e.g. `6#4d6kh3` for a set of ability scores. Roll20 uses the `N#`
 * form; `Nx` is accepted because it is what people type.
 */

import { defaultRandomSource, type RandomSource } from "../ports/random.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Condition {
	operator: ">" | "<" | ">=" | "<=" | "=";
	value: number;
}

export interface RepeatedExpression {
	/** How many independent rolls of `expression` were asked for. */
	times: number;
	expression: string;
}

export const MAX_REPEATS = 50;

/**
 * Split a leading repeat count off an expression: `6#4d6kh3` becomes
 * `{ times: 6, expression: "4d6kh3" }`. Anything else comes back with
 * `times: 1`, so callers can pass every expression through this.
 *
 * The count must be at the very start, which is what keeps it unambiguous:
 * no dice expression begins with an integer followed by `#` or `x`, and the
 * explode modifier `x` only ever appears after a die group.
 */
export function splitRepeat(input: string): RepeatedExpression {
	const match = input.match(/^\s*(\d{1,3})\s*[#x]\s*(?=[^\s#])(.*)$/i);
	if (!match) return { times: 1, expression: input.trim() };
	const times = Number.parseInt(match[1], 10);
	if (times < 1) throw new Error(`Repeat count must be at least 1: ${input}`);
	if (times > MAX_REPEATS) {
		throw new Error(`Refusing to repeat ${times} times (limit ${MAX_REPEATS}): ${input}`);
	}
	return { times, expression: match[2].trim() };
}

export type ModifierType = "kh" | "kl" | "dh" | "dl" | "r" | "rr" | "x" | "xo" | "min" | "max" | "cs" | "cf";

export interface Modifier {
	type: ModifierType;
	condition?: Condition;
	count?: number;
}

export type FnName = "floor" | "ceil" | "round" | "abs" | "min" | "max";

export type Expr =
	| { t: "num"; v: number }
	| { t: "die"; index: number; count: number; sides: number; fudge: boolean; mods: Modifier[]; source: string }
	| { t: "bin"; op: "+" | "-" | "*" | "/" | "%"; l: Expr; r: Expr }
	| { t: "neg"; e: Expr }
	| { t: "fn"; name: FnName; args: Expr[] };

export interface ParsedExpression {
	ast: Expr;
	/** Die groups in source order; `index` on a die node points here. */
	dice: Array<Extract<Expr, { t: "die" }>>;
	raw: string;
	/** Text after `#`, if any. */
	label?: string;
}

export interface RolledGroup {
	/** Every value rolled, including exploded extras and post-reroll values. */
	rolls: number[];
	/** Values that counted toward the group total. */
	kept: number[];
	/** Values discarded by keep/drop. */
	dropped: number[];
	/** Values replaced by a reroll, in the order they were replaced. */
	rerolled: number[];
	/** Group contribution to the total (a success count for cs/cf). */
	value: number;
	die: Extract<Expr, { t: "die" }>;
}

export interface RollResult {
	total: number;
	groups: RolledGroup[];
	expression: ParsedExpression;
	/** True when any single die landed on its maximum face. */
	hasMax: boolean;
	/** True when any single die landed on 1 (or -1 for Fudge dice). */
	hasMin: boolean;
}

export interface Distribution {
	min: number;
	max: number;
	probabilities: Map<number, number>;
	mean: number;
	stdDev: number;
	isSimulated: boolean;
}

const MAX_DICE = 2000;
const MAX_SIDES = 1_000_000;
const EXPLODE_SAFETY = 100;

// ── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
	| { k: "num"; v: number; text: string }
	| { k: "die"; count: number; sides: number; fudge: boolean; mods: Modifier[]; text: string }
	| { k: "op"; v: "+" | "-" | "*" | "/" | "%"; text: string }
	| { k: "lparen"; text: string }
	| { k: "rparen"; text: string }
	| { k: "comma"; text: string }
	| { k: "fn"; v: FnName; text: string };

const FN_NAMES: FnName[] = ["floor", "ceil", "round", "abs", "min", "max"];

function parseCondition(text: string): Condition | undefined {
	if (!text) return undefined;
	const m = text.match(/^(>=|<=|>|<|=)?(\d+)$/);
	if (!m) return undefined;
	return { operator: (m[1] || "=") as Condition["operator"], value: Number.parseInt(m[2], 10) };
}

/** Parse the modifier tail of a die group. Returns mods plus chars consumed. */
function parseModifiers(text: string): { mods: Modifier[]; consumed: number } {
	const mods: Modifier[] = [];
	let rest = text;
	let consumed = 0;
	for (;;) {
		let m: RegExpMatchArray | null;
		if ((m = rest.match(/^(kh|kl|dh|dl)(\d*)/i))) {
			mods.push({
				type: m[1].toLowerCase() as ModifierType,
				count: m[2] ? Number.parseInt(m[2], 10) : 1,
			});
		} else if ((m = rest.match(/^(min|max)(\d+)/i))) {
			mods.push({ type: m[1].toLowerCase() as ModifierType, count: Number.parseInt(m[2], 10) });
		} else if ((m = rest.match(/^(rr|r)(>=|<=|>|<|=)?(\d+)?/i))) {
			const cond = parseCondition((m[2] || "") + (m[3] || "1")) ?? { operator: "=" as const, value: 1 };
			mods.push({ type: m[1].toLowerCase() as ModifierType, condition: cond });
		} else if ((m = rest.match(/^(xo|x)(>=|<=|>|<|=)?(\d*)/i))) {
			const condText = m[3] ? (m[2] || "") + m[3] : "";
			mods.push({ type: m[1].toLowerCase() as ModifierType, condition: parseCondition(condText) });
		} else if ((m = rest.match(/^(cs|cf)(>=|<=|>|<|=)?(\d+)/i))) {
			const cond = parseCondition((m[2] || "") + m[3]);
			if (!cond) break;
			mods.push({ type: m[1].toLowerCase() as ModifierType, condition: cond });
		} else {
			break;
		}
		rest = rest.slice(m[0].length);
		consumed += m[0].length;
	}
	return { mods, consumed };
}

function tokenize(input: string): { tokens: Token[]; label?: string } {
	const hash = input.indexOf("#");
	const label = hash >= 0 ? input.slice(hash + 1).trim() || undefined : undefined;
	const body = (hash >= 0 ? input.slice(0, hash) : input).trim();

	const tokens: Token[] = [];
	let i = 0;
	while (i < body.length) {
		const ch = body[i];
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (ch === "(") {
			tokens.push({ k: "lparen", text: "(" });
			i++;
			continue;
		}
		if (ch === ")") {
			tokens.push({ k: "rparen", text: ")" });
			i++;
			continue;
		}
		if (ch === ",") {
			tokens.push({ k: "comma", text: "," });
			i++;
			continue;
		}
		if ("+-*/".includes(ch)) {
			tokens.push({ k: "op", v: ch as "+" | "-" | "*" | "/", text: ch });
			i++;
			continue;
		}

		const slice = body.slice(i);

		// Function name.
		const fn = slice.match(/^([a-z]+)\s*\(/i);
		if (fn) {
			const name = fn[1].toLowerCase();
			if (!FN_NAMES.includes(name as FnName)) {
				throw new Error(`Unknown function "${fn[1]}" in: ${input}`);
			}
			tokens.push({ k: "fn", v: name as FnName, text: name });
			i += fn[1].length;
			continue;
		}

		// Die group: [count]d(sides|%|F)[modifiers]
		const die = slice.match(/^(\d*)d(%|f(?:udge)?|\d+)/i);
		if (die) {
			const count = die[1] ? Number.parseInt(die[1], 10) : 1;
			const facesText = die[2].toLowerCase();
			const fudge = facesText.startsWith("f");
			const sides = fudge ? 3 : facesText === "%" ? 100 : Number.parseInt(facesText, 10);
			if (count < 1) throw new Error(`Die count must be at least 1 in: ${die[0]}`);
			if (count > MAX_DICE) throw new Error(`Refusing to roll ${count} dice (limit ${MAX_DICE})`);
			if (sides < 1 || sides > MAX_SIDES) throw new Error(`Bad die size in: ${die[0]}`);
			const { mods, consumed } = parseModifiers(slice.slice(die[0].length));
			tokens.push({
				k: "die",
				count,
				sides,
				fudge,
				mods,
				text: slice.slice(0, die[0].length + consumed),
			});
			i += die[0].length + consumed;
			continue;
		}

		// Plain number (integer or decimal).
		const num = slice.match(/^\d+(\.\d+)?/);
		if (num) {
			tokens.push({ k: "num", v: Number.parseFloat(num[0]), text: num[0] });
			i += num[0].length;
			continue;
		}

		// `%` only reaches here as the modulo operator.
		if (ch === "%") {
			tokens.push({ k: "op", v: "%", text: "%" });
			i++;
			continue;
		}

		throw new Error(`Cannot parse "${slice.slice(0, 12)}" in dice expression: ${input}`);
	}
	return { tokens, label };
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function parse(input: string): ParsedExpression {
	const { tokens, label } = tokenize(input);
	if (tokens.length === 0) throw new Error(`Empty dice expression: ${input}`);

	const dice: Array<Extract<Expr, { t: "die" }>> = [];
	let pos = 0;

	const peek = () => tokens[pos];
	const next = () => tokens[pos++];

	function parseExpr(): Expr {
		let left = parseTerm();
		for (;;) {
			const tok = peek();
			if (tok?.k === "op" && (tok.v === "+" || tok.v === "-")) {
				next();
				left = { t: "bin", op: tok.v, l: left, r: parseTerm() };
			} else {
				return left;
			}
		}
	}

	function parseTerm(): Expr {
		let left = parseUnary();
		for (;;) {
			const tok = peek();
			if (tok?.k === "op" && (tok.v === "*" || tok.v === "/" || tok.v === "%")) {
				next();
				left = { t: "bin", op: tok.v, l: left, r: parseUnary() };
			} else {
				return left;
			}
		}
	}

	function parseUnary(): Expr {
		const tok = peek();
		if (tok?.k === "op" && (tok.v === "-" || tok.v === "+")) {
			next();
			const inner = parseUnary();
			return tok.v === "-" ? { t: "neg", e: inner } : inner;
		}
		return parseAtom();
	}

	function parseAtom(): Expr {
		const tok = next();
		if (!tok) throw new Error(`Unexpected end of dice expression: ${input}`);
		if (tok.k === "num") return { t: "num", v: tok.v };
		if (tok.k === "die") {
			const node: Extract<Expr, { t: "die" }> = {
				t: "die",
				index: dice.length,
				count: tok.count,
				sides: tok.sides,
				fudge: tok.fudge,
				mods: tok.mods,
				source: tok.text,
			};
			dice.push(node);
			return node;
		}
		if (tok.k === "lparen") {
			const inner = parseExpr();
			const close = next();
			if (close?.k !== "rparen") throw new Error(`Missing ")" in dice expression: ${input}`);
			return inner;
		}
		if (tok.k === "fn") {
			const open = next();
			if (open?.k !== "lparen") throw new Error(`Expected "(" after ${tok.v} in: ${input}`);
			const args: Expr[] = [parseExpr()];
			for (;;) {
				const sep = peek();
				if (sep?.k === "comma") {
					next();
					args.push(parseExpr());
					continue;
				}
				break;
			}
			const close = next();
			if (close?.k !== "rparen") throw new Error(`Missing ")" after ${tok.v} in: ${input}`);
			if ((tok.v === "min" || tok.v === "max") && args.length < 2) {
				throw new Error(`${tok.v}() needs at least two arguments in: ${input}`);
			}
			return { t: "fn", name: tok.v, args };
		}
		throw new Error(`Unexpected "${tok.text}" in dice expression: ${input}`);
	}

	const ast = parseExpr();
	if (pos < tokens.length) {
		throw new Error(`Unexpected "${tokens[pos].text}" in dice expression: ${input}`);
	}
	if (dice.length === 0 && !/d/i.test(input)) {
		// Pure arithmetic is allowed (e.g. `/roll 7+3`) but flag nonsense early.
	}
	const totalDice = dice.reduce((sum, d) => sum + d.count, 0);
	if (totalDice > MAX_DICE) throw new Error(`Refusing to roll ${totalDice} dice (limit ${MAX_DICE})`);

	return { ast, dice, raw: input.trim(), label };
}

// ── Evaluation ───────────────────────────────────────────────────────────────

function meets(value: number, cond: Condition): boolean {
	switch (cond.operator) {
		case ">":
			return value > cond.value;
		case "<":
			return value < cond.value;
		case ">=":
			return value >= cond.value;
		case "<=":
			return value <= cond.value;
		case "=":
			return value === cond.value;
	}
}

function faceValue(die: Extract<Expr, { t: "die" }>, rng: RandomSource): number {
	return die.fudge ? rng.int(-1, 1) : rng.int(1, die.sides);
}

function maxFace(die: Extract<Expr, { t: "die" }>): number {
	return die.fudge ? 1 : die.sides;
}

function minFace(die: Extract<Expr, { t: "die" }>): number {
	return die.fudge ? -1 : 1;
}

function rollGroup(die: Extract<Expr, { t: "die" }>, rng: RandomSource): RolledGroup {
	let rolls = Array.from({ length: die.count }, () => faceValue(die, rng));
	const rerolled: number[] = [];

	for (const mod of die.mods) {
		if (mod.type === "r") {
			rolls = rolls.map((r) => {
				if (!meets(r, mod.condition!)) return r;
				rerolled.push(r);
				return faceValue(die, rng);
			});
		} else if (mod.type === "rr") {
			rolls = rolls.map((r) => {
				let v = r;
				let safety = EXPLODE_SAFETY;
				while (meets(v, mod.condition!) && safety-- > 0) {
					rerolled.push(v);
					v = faceValue(die, rng);
				}
				return v;
			});
		} else if (mod.type === "x" || mod.type === "xo") {
			const cond = mod.condition ?? { operator: "=" as const, value: maxFace(die) };
			const extra: number[] = [];
			for (const r of rolls) {
				if (!meets(r, cond)) continue;
				let v = faceValue(die, rng);
				extra.push(v);
				if (mod.type === "x") {
					let safety = EXPLODE_SAFETY;
					while (meets(v, cond) && safety-- > 0) {
						v = faceValue(die, rng);
						extra.push(v);
					}
				}
			}
			rolls.push(...extra);
		} else if (mod.type === "min") {
			rolls = rolls.map((r) => Math.max(r, mod.count!));
		} else if (mod.type === "max") {
			rolls = rolls.map((r) => Math.min(r, mod.count!));
		}
	}

	// Keep/drop works on indices so duplicate values are handled correctly.
	let keptIdx = rolls.map((_, i) => i);
	const byValueDesc = (a: number, b: number) => rolls[b] - rolls[a];
	const byValueAsc = (a: number, b: number) => rolls[a] - rolls[b];

	for (const mod of die.mods) {
		const n = mod.count ?? 1;
		if (mod.type === "kh") keptIdx = [...keptIdx].sort(byValueDesc).slice(0, n);
		else if (mod.type === "kl") keptIdx = [...keptIdx].sort(byValueAsc).slice(0, n);
		else if (mod.type === "dh") keptIdx = [...keptIdx].sort(byValueDesc).slice(n);
		else if (mod.type === "dl") keptIdx = [...keptIdx].sort(byValueAsc).slice(n);
	}
	keptIdx.sort((a, b) => a - b);

	const keptSet = new Set(keptIdx);
	const kept = keptIdx.map((i) => rolls[i]);
	const dropped = rolls.filter((_, i) => !keptSet.has(i));

	let value: number;
	const counter = die.mods.find((m) => m.type === "cs" || m.type === "cf");
	if (counter) {
		value = kept.filter((r) => meets(r, counter.condition!)).length;
	} else {
		value = kept.reduce((a, b) => a + b, 0);
	}

	return { rolls, kept, dropped, rerolled, value, die };
}

function evaluate(node: Expr, groups: RolledGroup[], rng: RandomSource): number {
	switch (node.t) {
		case "num":
			return node.v;
		case "die": {
			const group = rollGroup(node, rng);
			groups[node.index] = group;
			return group.value;
		}
		case "neg":
			return -evaluate(node.e, groups, rng);
		case "bin": {
			const l = evaluate(node.l, groups, rng);
			const r = evaluate(node.r, groups, rng);
			switch (node.op) {
				case "+":
					return l + r;
				case "-":
					return l - r;
				case "*":
					return l * r;
				case "/":
					if (r === 0) throw new Error("Division by zero in dice expression");
					return l / r;
				case "%":
					if (r === 0) throw new Error("Modulo by zero in dice expression");
					return l % r;
			}
			break;
		}
		case "fn": {
			const args = node.args.map((a) => evaluate(a, groups, rng));
			switch (node.name) {
				case "floor":
					return Math.floor(args[0]);
				case "ceil":
					return Math.ceil(args[0]);
				case "round":
					return Math.round(args[0]);
				case "abs":
					return Math.abs(args[0]);
				case "min":
					return Math.min(...args);
				case "max":
					return Math.max(...args);
			}
		}
	}
	throw new Error("Unreachable dice node");
}

export interface RollOptions {
	rng?: RandomSource;
}

export function rollExpression(expr: ParsedExpression, opts: RollOptions = {}): RollResult {
	const rng = opts.rng ?? defaultRandomSource();
	const groups: RolledGroup[] = [];
	const total = evaluate(expr.ast, groups, rng);
	const filled = groups.filter(Boolean);
	const hasMax = filled.some((g) => g.kept.some((v) => v === maxFace(g.die)));
	const hasMin = filled.some((g) => g.kept.some((v) => v === minFace(g.die)));
	return { total, groups: filled, expression: expr, hasMax, hasMin };
}

/** Parse and roll in one step. */
export function roll(expression: string, opts: RollOptions = {}): RollResult {
	return rollExpression(parse(expression), opts);
}

// ── Formatting ───────────────────────────────────────────────────────────────

function modifierText(mods: Modifier[]): string {
	return mods
		.map((m) => {
			let out: string = m.type;
			if (m.count !== undefined && !["r", "rr", "x", "xo", "cs", "cf"].includes(m.type)) out += m.count;
			if (m.condition) {
				out += m.condition.operator === "=" ? "" : m.condition.operator;
				out += m.condition.value;
			}
			return out;
		})
		.join("");
}

function groupText(group: RolledGroup): string {
	// Rebuild kept indices for display by matching values greedily.
	const keptSet = new Set<number>();
	const remaining = [...group.kept];
	group.rolls.forEach((value, i) => {
		const at = remaining.indexOf(value);
		if (at !== -1) {
			remaining.splice(at, 1);
			keptSet.add(i);
		}
	});
	const rendered = group.rolls.map((value, i) => (keptSet.has(i) ? String(value) : `~~${value}~~`));
	const counter = group.die.mods.find((m) => m.type === "cs" || m.type === "cf");
	const suffix = counter ? ` → ${group.value} ${group.value === 1 ? "success" : "successes"}` : "";
	return `[${rendered.join(", ")}]${suffix}`;
}

/** Render the AST with rolled dice substituted, e.g. `[6, 4, ~~2~~]+3`. */
function renderAst(node: Expr, groups: RolledGroup[]): string {
	switch (node.t) {
		case "num":
			return String(node.v);
		case "die": {
			const group = groups[node.index];
			return group ? groupText(group) : node.source;
		}
		case "neg":
			return `-${renderAst(node.e, groups)}`;
		case "bin": {
			const op = node.op === "*" ? " × " : node.op === "/" ? " ÷ " : ` ${node.op} `;
			return `${renderAst(node.l, groups)}${op}${renderAst(node.r, groups)}`;
		}
		case "fn":
			return `${node.name}(${node.args.map((a) => renderAst(a, groups)).join(", ")})`;
	}
}

function tidy(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** One-line result: `2d6kh1+3: [6, ~~2~~] + 3 = 9` */
export function formatRoll(result: RollResult): string {
	const groupsByIndex: RolledGroup[] = [];
	for (const g of result.groups) groupsByIndex[g.die.index] = g;
	const breakdown = renderAst(result.expression.ast, groupsByIndex);
	const label = result.expression.label ? ` (${result.expression.label})` : "";
	const simple = result.expression.dice.length === 1 && result.expression.dice[0].count === 1;
	const detail = simple && breakdown === String(result.total) ? "" : `${breakdown} = `;
	return `${result.expression.raw}${label}: ${detail}**${tidy(result.total)}**`;
}

/** Compact notation of the dice actually rolled, for logs. */
export function diceSummary(expr: ParsedExpression): string {
	return expr.dice.map((d) => `${d.count}d${d.fudge ? "F" : d.sides}${modifierText(d.mods)}`).join(", ");
}

// ── Distribution ─────────────────────────────────────────────────────────────

function singleDieDist(die: Extract<Expr, { t: "die" }>): Map<number, number> {
	const out = new Map<number, number>();
	if (die.fudge) {
		for (const v of [-1, 0, 1]) out.set(v, 1 / 3);
		return out;
	}
	for (let i = 1; i <= die.sides; i++) out.set(i, 1 / die.sides);
	return out;
}

function convolve(a: Map<number, number>, b: Map<number, number>): Map<number, number> {
	const out = new Map<number, number>();
	for (const [v1, p1] of a) {
		for (const [v2, p2] of b) {
			const k = v1 + v2;
			out.set(k, (out.get(k) ?? 0) + p1 * p2);
		}
	}
	return out;
}

function scaleDist(dist: Map<number, number>, factor: number): Map<number, number> {
	const out = new Map<number, number>();
	for (const [v, p] of dist) out.set(v * factor, (out.get(v * factor) ?? 0) + p);
	return out;
}

/**
 * Exact distribution for the additive-with-integer-scaling subset: plain dice,
 * +, -, and * by a constant. Returns null when anything else shows up, and the
 * caller falls back to Monte Carlo.
 */
function exactDist(node: Expr): Map<number, number> | null {
	switch (node.t) {
		case "num":
			return Number.isInteger(node.v) ? new Map([[node.v, 1]]) : null;
		case "die": {
			if (node.mods.length > 0) return null;
			let dist = singleDieDist(node);
			for (let i = 1; i < node.count; i++) dist = convolve(dist, singleDieDist(node));
			return dist;
		}
		case "neg": {
			const inner = exactDist(node.e);
			return inner ? scaleDist(inner, -1) : null;
		}
		case "bin": {
			const l = exactDist(node.l);
			const r = exactDist(node.r);
			if (!l || !r) return null;
			if (node.op === "+") return convolve(l, r);
			if (node.op === "-") return convolve(l, scaleDist(r, -1));
			if (node.op === "*") {
				// Only constant × distribution is exact here.
				const lConst = l.size === 1 ? [...l.keys()][0] : null;
				const rConst = r.size === 1 ? [...r.keys()][0] : null;
				if (rConst !== null) return scaleDist(l, rConst);
				if (lConst !== null) return scaleDist(r, lConst);
			}
			return null;
		}
		case "fn":
			return null;
	}
}

function statsOf(probabilities: Map<number, number>, isSimulated: boolean): Distribution {
	let mean = 0;
	let meanSq = 0;
	for (const [v, p] of probabilities) {
		mean += v * p;
		meanSq += v * v * p;
	}
	const keys = [...probabilities.keys()];
	return {
		min: Math.min(...keys),
		max: Math.max(...keys),
		probabilities,
		mean,
		stdDev: Math.sqrt(Math.max(0, meanSq - mean * mean)),
		isSimulated,
	};
}

export function analyze(input: string | ParsedExpression, iterations = 50_000): Distribution {
	const expr = typeof input === "string" ? parse(input) : input;
	const exact = exactDist(expr.ast);
	if (exact) return statsOf(exact, false);

	const counts = new Map<number, number>();
	for (let i = 0; i < iterations; i++) {
		const total = rollExpression(expr).total;
		counts.set(total, (counts.get(total) ?? 0) + 1);
	}
	const probabilities = new Map<number, number>();
	for (const [v, c] of counts) probabilities.set(v, c / iterations);
	return statsOf(probabilities, true);
}

/** Chance the expression meets a target, e.g. "at least 15". */
export function chanceOf(dist: Distribution, target: number, mode: "atLeast" | "atMost" | "exactly"): number {
	let p = 0;
	for (const [v, prob] of dist.probabilities) {
		if (mode === "atLeast" && v >= target) p += prob;
		else if (mode === "atMost" && v <= target) p += prob;
		else if (mode === "exactly" && v === target) p += prob;
	}
	return p;
}

/** Percentile position of a total within its distribution (0-100). */
export function percentileOf(dist: Distribution, total: number): number {
	let cumulative = 0;
	const sorted = [...dist.probabilities.entries()].sort((a, b) => a[0] - b[0]);
	for (const [v, p] of sorted) {
		if (v < total) cumulative += p;
		else if (v === total) {
			cumulative += p / 2;
			break;
		} else break;
	}
	return cumulative * 100;
}

export function formatDistribution(dist: Distribution, expression: string): string {
	const lines = [
		`**${expression}**`,
		`Range ${tidy(dist.min)}–${tidy(dist.max)} · mean ${dist.mean.toFixed(2)} · σ ${dist.stdDev.toFixed(2)} ${
			dist.isSimulated ? "(simulated)" : "(exact)"
		}`,
	];

	const sorted = [...dist.probabilities.entries()].sort((a, b) => a[0] - b[0]);
	const peak = Math.max(...sorted.map(([, p]) => p));
	const width = 28;
	const rows = sorted.length <= 32 ? sorted : null;

	if (rows) {
		lines.push("");
		for (const [v, p] of rows) {
			const bar = "█".repeat(Math.max(p > 0 ? 1 : 0, Math.round((p / peak) * width)));
			lines.push(`${String(v).padStart(4)} ${(p * 100).toFixed(1).padStart(5)}%  ${bar}`);
		}
	} else {
		const targets = [10, 25, 50, 75, 90];
		let cumulative = 0;
		let ti = 0;
		const marks: string[] = [];
		for (const [v, p] of sorted) {
			cumulative += p;
			while (ti < targets.length && cumulative * 100 >= targets[ti]) {
				marks.push(`P${targets[ti]} ≤${v}`);
				ti++;
			}
		}
		lines.push(marks.join(" · "));
	}
	return lines.join("\n");
}

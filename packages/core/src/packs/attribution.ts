/**
 * Attribution: carrying someone else's licence obligations correctly.
 *
 * Most content here is original writing under CC0, which has no obligations at
 * all. But a pack may adapt material from a system reference document, and those
 * are licensed — usually CC-BY-4.0 — with conditions that must travel with the
 * content forever, through every fork.
 *
 * Getting that right is not a matter of good intentions. CC-BY-4.0 §3(a) lists
 * specific things you must retain and specific things you must state, and two of
 * them are the ones people forget: **indicate that you modified the material**,
 * and **retain any indication of previous modifications**. A pack that adapts a
 * table into this library's shape has modified it, so that is not optional.
 *
 * So the obligations are **data, declared next to the content**, validated by a
 * test, and rendered into a NOTICE file the package ships. Nothing here depends
 * on a human remembering.
 *
 * ## Why it lives in the pack, not the repo
 *
 * Each content package carries its own attribution. A repo-level NOTICE would
 * mean one file accumulating the obligations of every system, which is wrong in
 * two ways: someone installing only `@portent/content-pf` would receive
 * obligations that do not apply to them, and someone forking one package would
 * leave the notice behind entirely.
 *
 * ## What this is not
 *
 * Not legal advice, and not a compliance guarantee. It is a checklist derived
 * from the licence text, mechanised so it cannot be skipped by accident. The
 * licence still governs.
 *
 * @see https://creativecommons.org/licenses/by/4.0/legalcode.en
 */

/**
 * Licences a pack may declare.
 *
 * Deliberately short. Each addition is a set of obligations somebody has to
 * satisfy forever, so the list grows only when a specific piece of content needs
 * it — not in anticipation.
 *
 * `CC0-1.0` and `CC-BY-4.0` are both valid SPDX identifiers, so `package.json`
 * can state them and every scanner understands them. The Open Game Licence and
 * ORC are **not** in the SPDX list, which is why no content here uses them: the
 * package metadata could not express the licence it was actually under.
 */
export const CONTENT_LICENSES = ["CC0-1.0", "CC-BY-4.0", "public domain"] as const;
export type ContentLicense = (typeof CONTENT_LICENSES)[number];

/** Licences whose conditions require an {@link Attribution} block. */
export const ATTRIBUTION_REQUIRED: readonly ContentLicense[] = ["CC-BY-4.0"];

export function isContentLicense(value: string): value is ContentLicense {
	return (CONTENT_LICENSES as readonly string[]).includes(value);
}

export function requiresAttribution(license: string): boolean {
	return (ATTRIBUTION_REQUIRED as readonly string[]).includes(license);
}

/**
 * Everything CC-BY-4.0 §3(a) obliges you to carry.
 *
 * Field comments cite the clause each one satisfies, so a reviewer can check the
 * shape against the licence rather than against my summary of it.
 */
export interface Attribution {
	/** Title of the work as the licensor gave it. */
	readonly title: string;
	/** §3(a)(1)(A)(i) — the creator(s), and anyone else designated for attribution. */
	readonly creator: string;
	/** §3(a)(1)(C) — the licence. An SPDX id where one exists. */
	readonly license: ContentLicense;
	/** §3(a)(1)(C) — the licence text, by URI. */
	readonly licenseUrl: string;
	/** §3(a)(1)(A)(v) — a URI for the licensed material, where practicable. */
	readonly sourceUrl?: string;
	/** §3(a)(1)(A)(ii) — the copyright notice, if the licensor supplied one. */
	readonly copyright?: string;
	/** §3(a)(1)(A)(iv) — the warranty disclaimer notice, if supplied. */
	readonly disclaimer?: string;
	/**
	 * §3(a)(1)(B) — whether this content is Adapted Material.
	 *
	 * Almost always true here: rewriting a table into this library's dice-keyed
	 * shape is a modification. Saying otherwise when you have edited the words is
	 * the most likely way to be out of compliance while feeling fine about it.
	 */
	readonly modified: boolean;
	/** §3(a)(1)(B) — what you changed. Required when `modified`. */
	readonly modificationNote?: string;
	/** §3(a)(1)(B) — modifications the licensor's own copy already declared. */
	readonly priorModifications?: readonly string[];
}

/** Where a pack's content came from, and under what licence. */
export interface Provenance {
	/** Free text: "original writing for Portent", or the work it came from. */
	readonly source: string;
	readonly license?: string;
	/** Required when {@link license} is one that imposes attribution conditions. */
	readonly attribution?: Attribution;
}

/**
 * Everything wrong with a provenance block. Empty means it is compliant *as
 * declared* — this checks the paperwork, not the truth of it.
 */
export function provenanceProblems(id: string, provenance: Provenance | undefined): string[] {
	const problems: string[] = [];
	if (!provenance) return [`${id} declares no provenance, so its licence is unknown`];

	const { license, attribution } = provenance;
	if (!license) {
		problems.push(`${id} declares no licence`);
	} else if (!isContentLicense(license)) {
		problems.push(
			`${id} declares the licence ${JSON.stringify(license)}, which is not one this project carries ` +
				`(${CONTENT_LICENSES.join(", ")}). Adding one is a deliberate decision, not a typo fix.`,
		);
	}

	if (license === "CC0-1.0" && !/original writing/i.test(provenance.source)) {
		problems.push(
			`${id} claims CC0 but its source does not claim authorship; CC0 is a dedication you can only make ` +
				"for work that is yours",
		);
	}

	if (license && requiresAttribution(license)) {
		if (!attribution) {
			problems.push(`${id} is ${license}, which requires an attribution block, and has none`);
			return problems;
		}
		// The five things §3(a)(1) makes unconditional for our case.
		if (!attribution.title.trim()) problems.push(`${id} attribution has no title`);
		if (!attribution.creator.trim()) problems.push(`${id} attribution names no creator (§3(a)(1)(A)(i))`);
		if (!attribution.licenseUrl.trim()) problems.push(`${id} attribution has no licence URI (§3(a)(1)(C))`);
		if (attribution.license !== license) {
			problems.push(`${id} declares ${license} but its attribution says ${attribution.license}`);
		}
		if (attribution.modified && !attribution.modificationNote?.trim()) {
			problems.push(
				`${id} is marked as modified but does not say how (§3(a)(1)(B) requires indicating the ` +
					"modification, not merely that one happened)",
			);
		}
		if (!attribution.sourceUrl?.trim()) {
			problems.push(
				`${id} attribution has no source URI; §3(a)(1)(A)(v) requires one where reasonably practicable, ` +
					"and for a document published on the web it is",
			);
		}
	}

	if (attribution && license && !requiresAttribution(license)) {
		problems.push(
			`${id} carries an attribution block but is ${license}, which imposes no attribution condition; ` +
				"either the licence is wrong or the block is misleading",
		);
	}

	return problems;
}

/**
 * One item's notice, as a markdown block.
 *
 * Ordered so the required elements come first and read as a sentence, because
 * §3(a)(2) permits satisfying the conditions "in any reasonable manner based on
 * the medium" and a notice nobody can read is not reasonable.
 */
export function renderAttribution(attribution: Attribution): string {
	const lines = [`### ${attribution.title}`, ""];
	lines.push(`- **Creator:** ${attribution.creator}`);
	if (attribution.copyright) lines.push(`- **Copyright:** ${attribution.copyright}`);
	lines.push(`- **Licence:** [${attribution.license}](${attribution.licenseUrl})`);
	if (attribution.sourceUrl) lines.push(`- **Source:** ${attribution.sourceUrl}`);
	lines.push(
		attribution.modified
			? `- **Modified:** yes — ${attribution.modificationNote}`
			: "- **Modified:** no",
	);
	for (const prior of attribution.priorModifications ?? []) {
		lines.push(`- **Previously modified:** ${prior}`);
	}
	if (attribution.disclaimer) lines.push("", `> ${attribution.disclaimer}`);
	return lines.join("\n");
}

export interface AttributedItem {
	readonly id: string;
	readonly provenance?: Provenance;
}

/**
 * The whole NOTICE body for a package.
 *
 * Returns `undefined` when nothing needs attribution, so a package of purely
 * original work ships no notice rather than an empty one claiming compliance
 * with nothing.
 */
export function renderNotice(
	packageName: string,
	items: readonly AttributedItem[],
): string | undefined {
	const attributed = items.filter((item) => item.provenance?.attribution);
	if (attributed.length === 0) return undefined;

	// One entry per distinct work, not per table: five tables adapted from one
	// document is one attribution with five items listed, which is what a reader
	// can actually use.
	const byWork = new Map<string, { attribution: Attribution; ids: string[] }>();
	for (const item of attributed) {
		const attribution = item.provenance!.attribution!;
		const key = `${attribution.title}|${attribution.creator}|${attribution.license}`;
		const existing = byWork.get(key);
		if (existing) existing.ids.push(item.id);
		else byWork.set(key, { attribution, ids: [item.id] });
	}

	const lines = [
		`# Attribution for ${packageName}`,
		"",
		"This file is generated from the provenance each pack declares. Do not edit it",
		"by hand: run the package's build to regenerate it.",
		"",
		"Content not listed here is original writing dedicated to the public domain",
		"under CC0-1.0, which imposes no attribution condition.",
		"",
	];
	for (const { attribution, ids } of byWork.values()) {
		lines.push(renderAttribution(attribution), "", `Applies to: ${ids.sort().map((id) => `\`${id}\``).join(", ")}`, "");
	}
	return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/**
 * The licence a package should declare in `package.json`.
 *
 * A package carrying CC-BY material is not CC0, and saying so would be a false
 * statement in the one field every scanner reads. Where licences are genuinely
 * mixed this returns an SPDX expression rather than picking a winner.
 */
export function packageLicenseFor(items: readonly AttributedItem[]): string {
	const licenses = new Set<string>();
	for (const item of items) {
		if (item.provenance?.license) licenses.add(item.provenance.license);
	}
	if (licenses.size === 0) return "CC0-1.0";
	// "public domain" is a statement of fact, not a licence grant, so it does not
	// widen the expression: a public-domain item inside a CC0 package is still CC0.
	licenses.delete("public domain");
	if (licenses.size === 0) return "CC0-1.0";
	return [...licenses].sort().join(" AND ");
}

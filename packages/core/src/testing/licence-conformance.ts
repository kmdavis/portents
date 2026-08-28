/**
 * A licence conformance suite any content package can run against itself.
 *
 * Published from `@portent/core/testing` for the same reason the storage
 * conformance suite is: the rules belong with the thing that defines them, and a
 * package that ships content should be able to prove its own paperwork without
 * the repo reaching in to police it.
 *
 * That matters for forks. Someone publishing `@portent/content-yourgame` gets the
 * same checks, including the ones about attribution they would not have thought
 * of, without copying a test file that will drift.
 *
 * Cases are returned as data and driven by the caller's own test runner, the same
 * shape as the storage conformance suite, so this module imports no test
 * framework and stays isomorphic like the rest of the library.
 *
 * ```ts
 * import { describe, it } from "node:test";
 * import { licenceConformanceCases } from "@portent/core/testing";
 * import { dndContent } from "./index.ts";
 *
 * describe("licences", () => {
 *   for (const c of licenceConformanceCases({
 *     packageName: "@portent/content-dnd",
 *     packs: [dndContent],
 *     allow: ["CC0-1.0", "CC-BY-4.0"],
 *   })) {
 *     it(c.name, c.run);
 *   }
 * });
 * ```
 */

import {
	type AttributedItem,
	isDistributable,
	type ContentLicense,
	packageLicenseFor,
	provenanceProblems,
	renderNotice,
} from "../packs/attribution.ts";
import type { ContentPack } from "../packs/registry.ts";

export interface LicenceConformanceOptions {
	/** As published, e.g. `@portent/content-dnd`. Appears in the notice. */
	readonly packageName: string;
	readonly packs: readonly ContentPack[];
	/**
	 * Licences this package permits.
	 *
	 * Declared per package rather than globally, because a package of original
	 * writing should *fail* if third-party content appears in it, while a package
	 * that exists to carry adapted content should not.
	 */
	readonly allow: readonly ContentLicense[];
	/**
	 * The NOTICE file's current contents, or `undefined` if there is no such file.
	 *
	 * Contents rather than a path, so this module reads nothing and stays usable in
	 * a browser like the rest of the library. The caller is already a Node test and
	 * can spend two lines on `readFileSync`.
	 */
	readonly notice?: string | undefined;
	/** Whether a NOTICE file exists, so its *absence* can be asserted too. */
	readonly noticeExists?: boolean;
	/** The `license` field the package declares, to check it against the content. */
	readonly declaredLicense?: string;
	/**
	 * Whether the package can be published, i.e. `private` is not true.
	 *
	 * When given, a package holding non-distributable content must report `false`.
	 * This is the check that stops a pack of tables typed out of a rulebook from
	 * sitting in something publishable.
	 */
	readonly publishable?: boolean;
}

function itemsOf(packs: readonly ContentPack[]): AttributedItem[] {
	const items: AttributedItem[] = [];
	for (const pack of packs) {
		for (const deck of pack.decks ?? []) items.push({ id: `deck:${deck.id}`, provenance: deck.provenance });
		for (const table of pack.tables ?? []) items.push({ id: `table:${table.id}`, provenance: table.provenance });
		// A pack-level provenance covers anything that declares none of its own.
		if (pack.provenance) items.push({ id: `pack:${pack.id}`, provenance: pack.provenance });
	}
	return items;
}

/** One named check. `run` throws on failure, so any runner can drive it. */
export interface LicenceConformanceCase {
	readonly name: string;
	readonly run: () => void;
}

function fail(message: string): never {
	throw new Error(message);
}

export function licenceConformanceCases(options: LicenceConformanceOptions): LicenceConformanceCase[] {
	const items = itemsOf(options.packs);
	const cases: LicenceConformanceCase[] = [
		{
			name: "has content to check",
			run: () => {
				if (items.length === 0) fail("no items found; the packs are empty or shaped unexpectedly");
			},
		},
		{
			name: "declares a licence for every item",
			run: () => {
				const missing = items.filter((item) => !item.provenance?.license).map((item) => item.id);
				if (missing.length > 0) fail(`items with no licence: ${missing.join(", ")}`);
			},
		},
		{
			name: "uses only the licences this package permits",
			run: () => {
				const allowed = new Set<string>(options.allow);
				const offenders = items
					.filter((item) => item.provenance?.license && !allowed.has(item.provenance.license))
					.map((item) => `${item.id} (${item.provenance!.license})`);
				if (offenders.length > 0) {
					fail(
						`licences outside this package's policy [${options.allow.join(", ")}]: ${offenders.join(", ")}`,
					);
				}
			},
		},
		{
			name: "satisfies the conditions of each licence it uses",
			run: () => {
				// The real check. Attribution-bearing licences have specific obligations,
				// and this is where a missing modification note or source URI is caught.
				const problems = items.flatMap((item) => provenanceProblems(item.id, item.provenance));
				if (problems.length > 0) fail(`\n  ${problems.join("\n  ")}`);
			},
		},
	];

	if (options.declaredLicense !== undefined) {
		cases.push({
			name: "declares a package licence that matches its contents",
			run: () => {
				// A package carrying CC-BY material is not CC0, and the declared licence
				// is the one field every scanner reads.
				const expected = packageLicenseFor(items);
				if (options.declaredLicense !== expected) {
					fail(
						`the package declares ${JSON.stringify(options.declaredLicense)} but its content is ` +
							`${JSON.stringify(expected)}`,
					);
				}
			},
		});
	}

	if (options.publishable !== undefined) {
		cases.push({
			name: "is private if it holds anything non-distributable",
			run: () => {
				const offenders = items
					.filter((item) => item.provenance?.license && !isDistributable(item.provenance.license))
					.map((item) => item.id);
				if (offenders.length > 0 && options.publishable) {
					fail(
						`this package holds content nobody may redistribute (${offenders.join(", ")}) but is ` +
							'publishable. Set "private": true and "license": "UNLICENSED".',
					);
				}
			},
		});
	}

	if (options.noticeExists !== undefined) {
		cases.push({
			name: "ships a NOTICE that matches its declared attribution",
			run: () => {
				const expected = renderNotice(options.packageName, items);
				if (expected === undefined) {
					if (options.noticeExists) {
						fail("nothing here requires attribution, so a NOTICE file claims compliance with nothing");
					}
					return;
				}
				if (!options.noticeExists) fail("missing NOTICE.md; regenerate it");
				if (options.notice !== expected) fail("NOTICE is stale: regenerate it, and check what changed");
			},
		});
	}

	return cases;
}

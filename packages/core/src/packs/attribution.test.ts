import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type Attribution,
	CONTENT_LICENSES,
	isContentLicense,
	packageLicenseFor,
	type Provenance,
	provenanceProblems,
	renderAttribution,
	renderNotice,
	requiresAttribution,
} from "./attribution.ts";

const original: Provenance = { source: "original writing for Portent", license: "CC0-1.0" };

/**
 * A realistic CC-BY block.
 *
 * The values here are shaped like the real thing but are NOT the real attribution
 * string: each SRD specifies its own required wording in its preamble, and that
 * text has to be copied from the document rather than reconstructed. A test
 * fixture must not become the source someone copies.
 */
const adapted: Attribution = {
	title: "System Reference Document 5.2.1",
	creator: "Wizards of the Coast LLC",
	license: "CC-BY-4.0",
	licenseUrl: "https://creativecommons.org/licenses/by/4.0/legalcode.en",
	sourceUrl: "https://www.dndbeyond.com/srd",
	copyright: "EXAMPLE ONLY — use the notice printed in the SRD preamble",
	modified: true,
	modificationNote: "one table restructured into this library's dice-keyed shape; wording condensed",
};

describe("the licence list", () => {
	it("is short on purpose, and every entry is a real SPDX id or a plain statement", () => {
		assert.deepEqual([...CONTENT_LICENSES], ["CC0-1.0", "CC-BY-4.0", "public domain"]);
		for (const licence of CONTENT_LICENSES) assert.ok(isContentLicense(licence));
		assert.ok(!isContentLicense("OGL-1.0a"), "the OGL is not SPDX and must not be accepted");
		assert.ok(!isContentLicense("ORC-1.0"), "ORC is not SPDX and must not be accepted");
	});

	it("knows which licences carry an attribution condition", () => {
		assert.ok(requiresAttribution("CC-BY-4.0"));
		assert.ok(!requiresAttribution("CC0-1.0"));
		assert.ok(!requiresAttribution("public domain"));
	});
});

describe("checking a provenance block", () => {
	it("passes original CC0 work", () => {
		assert.deepEqual(provenanceProblems("table:traps", original), []);
	});

	it("passes a complete CC-BY block", () => {
		assert.deepEqual(
			provenanceProblems("table:wild-magic", { source: "SRD 5.2.1", license: "CC-BY-4.0", attribution: adapted }),
			[],
		);
	});

	it("refuses a CC0 claim on work that is not yours", () => {
		// CC0 is a dedication, and you can only dedicate what you hold.
		assert.match(
			provenanceProblems("t", { source: "adapted from a rulebook", license: "CC0-1.0" })[0],
			/CC0 is a dedication you can only make for work that is yours/,
		);
	});

	it("refuses a licence the project does not carry", () => {
		const problems = provenanceProblems("t", { source: "x", license: "OGL-1.0a" });
		assert.match(problems[0], /not one this project carries/);
		assert.match(problems[0], /deliberate decision, not a typo fix/);
	});

	it("refuses CC-BY with no attribution at all", () => {
		assert.match(
			provenanceProblems("t", { source: "SRD", license: "CC-BY-4.0" })[0],
			/requires an attribution block, and has none/,
		);
	});

	it("requires the creator, title and licence URI", () => {
		for (const [field, value] of [["creator", ""], ["title", ""], ["licenseUrl", ""]] as const) {
			const problems = provenanceProblems("t", {
				source: "SRD",
				license: "CC-BY-4.0",
				attribution: { ...adapted, [field]: value },
			});
			assert.ok(problems.length > 0, `a missing ${field} was accepted`);
		}
	});

	it("requires saying HOW it was modified, not just that it was", () => {
		// The clause people miss. §3(a)(1)(B) says indicate the modification.
		const problems = provenanceProblems("t", {
			source: "SRD",
			license: "CC-BY-4.0",
			attribution: { ...adapted, modificationNote: undefined },
		});
		assert.match(problems[0], /does not say how/);
		assert.match(problems[0], /§3\(a\)\(1\)\(B\)/);
	});

	it("requires a source URI for a document published on the web", () => {
		const problems = provenanceProblems("t", {
			source: "SRD",
			license: "CC-BY-4.0",
			attribution: { ...adapted, sourceUrl: undefined },
		});
		assert.match(problems[0], /§3\(a\)\(1\)\(A\)\(v\)/);
	});

	it("catches a licence and an attribution that disagree", () => {
		assert.match(
			provenanceProblems("t", {
				source: "SRD",
				license: "CC-BY-4.0",
				attribution: { ...adapted, license: "CC0-1.0" },
			})[0],
			/declares CC-BY-4.0 but its attribution says CC0-1.0/,
		);
	});

	it("catches an attribution block on a licence that imposes none", () => {
		// Either the licence is wrong or the block implies an obligation nobody has.
		assert.match(
			provenanceProblems("t", { source: "original writing", license: "CC0-1.0", attribution: adapted })[0],
			/imposes no attribution condition/,
		);
	});

	it("reports a missing provenance rather than assuming the best", () => {
		assert.match(provenanceProblems("t", undefined)[0], /declares no provenance/);
	});
});

describe("rendering a notice", () => {
	it("carries every required element", () => {
		const rendered = renderAttribution(adapted);
		assert.match(rendered, /System Reference Document 5\.2\.1/);
		assert.match(rendered, /\*\*Creator:\*\* Wizards of the Coast LLC/);
		assert.match(rendered, /\[CC-BY-4\.0\]\(https:\/\/creativecommons\.org/);
		assert.match(rendered, /\*\*Source:\*\* https:\/\/www\.dndbeyond\.com\/srd/);
		assert.match(rendered, /\*\*Modified:\*\* yes — one table restructured/);
	});

	it("states plainly when nothing was modified", () => {
		assert.match(renderAttribution({ ...adapted, modified: false, modificationNote: undefined }), /\*\*Modified:\*\* no/);
	});

	it("retains prior modifications", () => {
		const rendered = renderAttribution({ ...adapted, priorModifications: ["condensed by an earlier publisher"] });
		assert.match(rendered, /Previously modified:\*\* condensed by an earlier publisher/);
	});

	it("returns nothing for a package of purely original work", () => {
		// An empty NOTICE would claim compliance with nothing.
		assert.equal(renderNotice("@portent/content-generic", [{ id: "table:a", provenance: original }]), undefined);
	});

	it("groups items by the work they came from", () => {
		// Five tables from one document is one attribution listing five items, which
		// is what a reader can actually act on.
		const items = ["a", "b", "c"].map((id) => ({
			id: `table:${id}`,
			provenance: { source: "SRD", license: "CC-BY-4.0" as const, attribution: adapted },
		}));
		const notice = renderNotice("@portent/content-dnd", items)!;
		assert.equal((notice.match(/### System Reference Document/g) ?? []).length, 1);
		assert.match(notice, /Applies to: `table:a`, `table:b`, `table:c`/);
	});

	it("says the unlisted content is CC0, so the notice is not read as exhaustive", () => {
		const notice = renderNotice("@portent/content-dnd", [
			{ id: "t", provenance: { source: "SRD", license: "CC-BY-4.0", attribution: adapted } },
		])!;
		assert.match(notice, /Content not listed here is original writing/);
		assert.match(notice, /generated from the provenance/);
		assert.ok(notice.endsWith("\n"));
	});
});

describe("the package licence field", () => {
	it("is CC0 for a package of original work", () => {
		assert.equal(packageLicenseFor([{ id: "a", provenance: original }]), "CC0-1.0");
	});

	it("becomes an SPDX expression when licences are genuinely mixed", () => {
		// A package carrying CC-BY material is not CC0, and saying so in the one
		// field every scanner reads would be a false statement.
		assert.equal(
			packageLicenseFor([
				{ id: "a", provenance: original },
				{ id: "b", provenance: { source: "SRD", license: "CC-BY-4.0", attribution: adapted } },
			]),
			"CC-BY-4.0 AND CC0-1.0",
		);
	});

	it("does not let a public-domain item widen the expression", () => {
		assert.equal(
			packageLicenseFor([
				{ id: "a", provenance: original },
				{ id: "b", provenance: { source: "a standard 54-card deck", license: "public domain" } },
			]),
			"CC0-1.0",
		);
	});
});

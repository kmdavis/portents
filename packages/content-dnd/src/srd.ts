/**
 * The attribution statements the System Reference Documents require.
 *
 * **Copied verbatim from each document's Legal Information page**, not
 * reconstructed. Both SRDs specify the exact wording that must appear in work
 * using them, and both add a further instruction: include no other attribution
 * to the publisher beyond the statement given.
 *
 * Verified against the published PDFs:
 * - SRD 5.2.1 — https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf
 * - SRD 5.1   — https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1.pdf
 *
 * SRD 5.1 is offered under OGL 1.0a *and* CC-BY-4.0; we take the CC-BY-4.0
 * option, because the OGL's chain-of-notices obligation is perpetual bookkeeping
 * and the OGL has no SPDX identifier. SRD 5.2.1 is CC-BY-4.0 only.
 */

import type { Attribution } from "@portents/core";

const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/legalcode";

/**
 * The required statement for SRD 5.2.1, verbatim.
 *
 * Reproduced exactly. Editing this string for style would break the condition it
 * exists to satisfy.
 */
export const SRD_5_2_1_STATEMENT =
	'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the ' +
	"Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative " +
	"Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.";

/** The required statement for SRD 5.1, verbatim. */
export const SRD_5_1_STATEMENT =
	'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of ' +
	"the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The " +
	"SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at " +
	"https://creativecommons.org/licenses/by/4.0/legalcode.";

/** Section 5 of CC-BY-4.0 disclaims warranties; both SRDs point this out. */
const DISCLAIMER =
	"Section 5 of CC-BY-4.0 includes a Disclaimer of Warranties and Limitation of Liability that limits " +
	"the licensor's liability to you.";

export const SRD_5_2_1: Attribution = {
	title: "System Reference Document 5.2.1",
	creator: "Wizards of the Coast LLC",
	license: "CC-BY-4.0",
	licenseUrl: LICENSE_URL,
	sourceUrl: "https://www.dndbeyond.com/srd",
	copyright: SRD_5_2_1_STATEMENT,
	disclaimer: DISCLAIMER,
	modified: true,
	modificationNote:
		"entries restructured into this library's dice-keyed table shape and condensed to one line each; " +
		"mechanics summarised rather than reproduced in full",
};

export const SRD_5_1: Attribution = {
	title: "System Reference Document 5.1",
	creator: "Wizards of the Coast LLC",
	license: "CC-BY-4.0",
	licenseUrl: LICENSE_URL,
	sourceUrl: "https://dnd.wizards.com/resources/systems-reference-document",
	copyright: SRD_5_1_STATEMENT,
	disclaimer: DISCLAIMER,
	modified: true,
	modificationNote:
		"entries restructured into this library's dice-keyed table shape and condensed to one line each",
};

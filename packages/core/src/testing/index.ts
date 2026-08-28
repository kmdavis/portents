/**
 * Test helpers, published so that anyone writing a Storage adapter can prove it
 * satisfies the same contract the bundled adapters do.
 */

export {
	type ConformanceCase,
	detectCaseSensitivity,
	type StorageCapabilities,
	storageConformanceCaseNames,
	storageConformanceCases,
	type StorageFactory,
} from "./storage-conformance.ts";
export {
	type LicenceConformanceCase,
	licenceConformanceCases,
	type LicenceConformanceOptions,
} from "./licence-conformance.ts";

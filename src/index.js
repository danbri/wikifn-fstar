export { parseJsonStrict, stableStringify } from "./canonical-json.js";
export {
  analyzeSeeds,
  classifyCanonicalObject,
  classifyFetchedObject,
  collectCompositionCalls,
  defaultVerifiedPrimitives,
  fetchAnalysisCorpus,
  parsePrimitiveOption
} from "./composition-analysis.js";
export { normalizeCanonical } from "./normalize.js";
export { checkStructural, collectMissingReferences, functionArguments, shallowTypeOf } from "./structural.js";
export { buildObjectVersion, buildWorld, digestCanonical, loadSnapshotFile, World } from "./world.js";
export { fetchCanonicalObjects, fetchPinnedZObjects, fetchRevisions } from "./wikifunctions-api.js";
export { evaluate, evaluationSummary } from "./evaluator.js";
export { booleanValue, builtinFunctions, naturalNumber, readBoolean, readNaturalNumber } from "./builtins.js";
export {
  collectReferences,
  describeTerm,
  getField,
  refZid,
  stringValue,
  termEquals,
  toCanonicalJson,
  toNormalJson,
  typeZid,
  zList,
  zListItems,
  zRecord,
  zRef,
  zString
} from "./zterm.js";

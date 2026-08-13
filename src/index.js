export { parseJsonStrict, stableStringify } from "./canonical-json.js";
export { defaultCacheDir, WikifunctionsCache } from "./cache.js";
export { importMediaWikiXmlDump, parseZObjectPage, readDumpPages } from "./dump-import.js";
export {
  buildSqliteIndex,
  defaultSqliteDbPath,
  runSqliteQuery,
  sqliteIndexStats,
  sqliteSchema
} from "./sqlite-index.js";
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
export { evaluate, evaluationSummary } from "./junk-proof-of-concept-evaluator.js";
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

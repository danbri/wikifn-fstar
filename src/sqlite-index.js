import { spawn } from "node:child_process";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

import { analyzeSeeds, classifyFetchedObject, defaultVerifiedPrimitives } from "./composition-analysis.js";
import { defaultCacheDir, WikifunctionsCache } from "./cache.js";
import { stableStringify } from "./canonical-json.js";
import { buildObjectVersion } from "./world.js";

const DEFAULT_DB_PATH = "cache/wikifunctions.sqlite";

const primitiveGrounding = [
  ["Z782", "is zero", "fstar_checked_js_builtin", "Wikifn.Primitives", "Toy natural-number primitive used by eval-example"],
  ["Z783", "successor", "fstar_checked_js_builtin", "Wikifn.Primitives", "Toy natural-number primitive used by eval-example"],
  ["Z784", "predecessor", "fstar_checked_js_builtin", "Wikifn.Primitives", "Toy natural-number primitive used by eval-example"],
  ["Z801", "Boolean true", "trusted_wikifunctions_core", null, "Known Boolean identity"],
  ["Z802", "if", "fstar_checked_control", "Wikifn.Primitive.Kernel", "Lazy branch selection specified as z802_if"],
  ["Z13522", "natural equality", "fstar_spec_candidate", "Wikifn.Primitive.Kernel", "Specification exists; Wikifunctions argument mapping still pending"],
  ["Z10008", "string is empty", "fstar_checked_kernel", "Wikifn.Primitive.Kernel", "Checked as z10008_is_empty_string over codepoint-list text"],
  ["Z10075", "replace all substrings", "fstar_checked_kernel", "Wikifn.Primitive.Kernel", "Checked as z10075_replace_all_substrings over codepoint-list text"],
  ["Z10901", "get first character of string", "fstar_checked_kernel", "Wikifn.Primitive.Kernel", "Checked as z10901_get_first_character over codepoint-list text"],
  ["Z11040", "string length", "fstar_spec_candidate", "Wikifn.Primitive.Kernel", "Specification exists; Wikifunctions argument mapping still pending"],
  ["Z14124", "string of characters from unicode range", "fstar_checked_kernel", "Wikifn.Primitive.Kernel", "Checked as z14124_string_of_characters_from_unicode_range"],
  ["Z14456", "remove first character", "fstar_checked_kernel", "Wikifn.Primitive.Kernel", "Checked as z14456_remove_first_character over codepoint-list text"],
  ["Z14520", "remove all characters in second string", "fstar_checked_kernel", "Wikifn.Primitive.Kernel", "Checked as z14520_remove_all_characters_in_second_string"],
  ["Z10000", "string concat", "fstar_spec_candidate", "Wikifn.Primitive.Kernel", "Specification exists; Wikifunctions argument mapping still pending"],
  ["Z10615", "string starts with", "fstar_spec_candidate", "Wikifn.Primitive.Kernel", "Specification exists; Wikifunctions argument mapping still pending"]
];

export function defaultSqliteDbPath() {
  return DEFAULT_DB_PATH;
}

export async function buildSqliteIndex(options = {}) {
  const cache = options.objectCache ?? new WikifunctionsCache(options.cacheDir ?? defaultCacheDir());
  const dbPath = path.resolve(options.dbPath ?? DEFAULT_DB_PATH);
  const tmpPath = `${dbPath}.${process.pid}.tmp`;
  const latestOnly = options.allRevisions ? false : true;
  const includeJson = options.includeJson ?? false;
  const materializeAnalysis = options.analyze ?? false;
  const stats = emptyBuildStats(dbPath, cache.root);

  await mkdir(path.dirname(dbPath), { recursive: true });
  await unlink(tmpPath).catch((error) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });

  const sqlite = spawn("sqlite3", [tmpPath], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  sqlite.stderr.setEncoding("utf8");
  sqlite.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  await writeSql(sqlite, schemaSql());
  await writeSql(sqlite, "BEGIN IMMEDIATE;\n");
  await writeSql(sqlite, insert("metadata", ["key", "value"], ["schema_version", "1"]));
  await writeSql(sqlite, insert("metadata", ["key", "value"], ["source_cache", cache.root]));
  await writeSql(sqlite, insert("metadata", ["key", "value"], ["latest_only", latestOnly ? "true" : "false"]));
  await writeSql(sqlite, insert("metadata", ["key", "value"], ["include_json", includeJson ? "true" : "false"]));
  await writeSql(sqlite, insert("metadata", ["key", "value"], ["materialized_analysis", materializeAnalysis ? "true" : "false"]));
  await writePrimitiveRows(sqlite);

  const entries = await cache.listRevisions({ latestOnly });
  const corpus = { objects: new Map(), get(zid) { return this.objects.get(zid); } };
  const functionZids = [];
  for (const entry of entries) {
    await indexCacheEntry(sqlite, entry, { includeJson, stats, corpus, functionZids });
  }

  if (materializeAnalysis) {
    await indexCompositionAnalysis(sqlite, corpus, functionZids, stats);
  }

  for (const [key, value] of Object.entries({
    object_count: stats.objects,
    function_count: stats.functions,
    implementation_count: stats.implementations,
    composition_call_count: stats.compositionCalls,
    dynamic_call_count: stats.dynamicCalls,
    reference_edge_count: stats.referenceEdges,
    composition_closed_count: stats.compositionClosed,
    open_frontier_count: stats.openFrontier,
    primitive_analysis_count: stats.primitiveAnalysis,
    label_count: stats.labels,
    description_count: stats.descriptions,
    index_error_count: stats.errors
  })) {
    await writeSql(sqlite, insert("metadata", ["key", "value"], [key, String(value)]));
  }

  await writeSql(sqlite, "COMMIT;\n");
  sqlite.stdin.end();
  const exit = await waitForExit(sqlite);
  if (exit.code !== 0) {
    await unlink(tmpPath).catch(() => {});
    throw new Error(`sqlite3 failed with code ${exit.code}: ${stderr.trim()}`);
  }

  await rename(tmpPath, dbPath);
  return stats;
}

async function indexCacheEntry(sqlite, entry, { includeJson, stats, corpus, functionZids }) {
  const canonicalJson = includeJson && entry.canonical ? stableStringify(entry.canonical) : null;
  if (entry.invalidCacheEntry) {
    stats.errors += 1;
    await writeSql(
      sqlite,
      insert("objects", objectColumns(), [
        entry.zid,
        entry.revision,
        0,
        null,
        "invalid_cache_entry",
        null,
        null,
        null,
        null,
        null,
        entry.cachePath,
        canonicalJson,
        "invalid_cache_entry",
        "cache digest mismatch or unreadable cache file"
      ])
    );
    await writeSql(sqlite, insert("index_errors", ["zid", "revision", "code", "message"], [
      entry.zid,
      entry.revision,
      "invalid_cache_entry",
      "cache digest mismatch or unreadable cache file"
    ]));
    return;
  }

  const classified = classifyFetchedObject(entry);
  if (!classified.ok) {
    stats.errors += 1;
    await writeSql(
      sqlite,
      insert("objects", objectColumns(), [
        entry.zid,
        entry.revision,
        entry.latest ? 1 : 0,
        null,
        "index_error",
        entry.digest,
        entry.mediawikiSha1,
        entry.timestamp,
        entry.user,
        entry.source,
        entry.cachePath,
        canonicalJson,
        classified.error.code,
        classified.error.message
      ])
    );
    await writeSql(sqlite, insert("index_errors", ["zid", "revision", "code", "message", "path_json", "details_json"], [
      entry.zid,
      entry.revision,
      classified.error.code,
      classified.error.message,
      stableStringify(classified.error.path ?? []),
      stableStringify(classified.error.details ?? {})
    ]));
    return;
  }

  const object = classified.value;
  corpus.objects.set(object.zid, object);
  stats.objects += 1;
  await writeSql(
    sqlite,
    insert("objects", objectColumns(), [
      object.zid,
      object.revision,
      entry.latest ? 1 : 0,
      object.ztype,
      object.kind,
      object.digest,
      entry.mediawikiSha1,
      object.timestamp,
      object.user,
      entry.source,
      entry.cachePath,
      canonicalJson,
      null,
      null
    ])
  );

  for (const text of extractMultilingualTexts(entry.canonical, "Z2K3")) {
    stats.labels += 1;
    await writeSql(sqlite, insert("labels", ["zid", "revision", "lang_zid", "text"], [object.zid, object.revision, text.lang, text.text]));
  }
  for (const text of extractMultilingualTexts(entry.canonical, "Z2K5")) {
    stats.descriptions += 1;
    await writeSql(
      sqlite,
      insert("descriptions", ["zid", "revision", "lang_zid", "text"], [object.zid, object.revision, text.lang, text.text])
    );
  }

  const normalized = buildObjectVersion(entry);
  const references = normalized.ok ? collectReferenceEdges(normalized.value.persistent) : [];
  for (let index = 0; index < references.length; index += 1) {
    stats.referenceEdges += 1;
    const edge = references[index];
    await writeSql(
      sqlite,
      insert("reference_edges", ["from_zid", "from_revision", "to_zid", "path", "ordinal"], [
        object.zid,
        object.revision,
        edge.toZid,
        edge.path,
        index
      ])
    );
  }

  if (object.kind === "function") {
    stats.functions += 1;
    functionZids.push(object.zid);
    await writeSql(
      sqlite,
      insert("functions", ["zid", "revision", "return_type_json", "implementation_count", "tester_count"], [
        object.zid,
        object.revision,
        object.returnType === undefined ? null : stableStringify(object.returnType),
        object.implementationZids.length,
        object.testerZids.length
      ])
    );
    for (let index = 0; index < object.implementationZids.length; index += 1) {
      await writeSql(
        sqlite,
        insert("function_implementations", ["function_zid", "function_revision", "implementation_zid", "ordinal"], [
          object.zid,
          object.revision,
          object.implementationZids[index],
          index
        ])
      );
    }
    for (let index = 0; index < object.testerZids.length; index += 1) {
      await writeSql(
        sqlite,
        insert("function_testers", ["function_zid", "function_revision", "tester_zid", "ordinal"], [
          object.zid,
          object.revision,
          object.testerZids[index],
          index
        ])
      );
    }
  }

  if (object.kind === "implementation") {
    stats.implementations += 1;
    await writeSql(
      sqlite,
      insert("implementations", ["zid", "revision", "function_zid", "body_kind", "code_language", "code_length", "builtin_reference_json"], [
        object.zid,
        object.revision,
        object.target,
        object.bodyKind,
        object.codeLanguage,
        object.codeLength,
        object.builtinReference === undefined ? null : stableStringify(object.builtinReference)
      ])
    );
    for (let index = 0; index < object.compositionCalls.length; index += 1) {
      stats.compositionCalls += 1;
      const call = object.compositionCalls[index];
      await writeSql(
        sqlite,
        insert("composition_calls", ["from_impl_zid", "from_impl_revision", "to_function_zid", "path", "ordinal"], [
          object.zid,
          object.revision,
          call.functionZid,
          call.path,
          index
        ])
      );
    }
    for (let index = 0; index < object.dynamicCalls.length; index += 1) {
      stats.dynamicCalls += 1;
      const call = object.dynamicCalls[index];
      await writeSql(
        sqlite,
        insert("dynamic_calls", ["from_impl_zid", "from_impl_revision", "path", "term_json", "ordinal"], [
          object.zid,
          object.revision,
          call.path,
          stableStringify(call.term),
          index
        ])
      );
    }
  }
}

async function indexCompositionAnalysis(sqlite, corpus, functionZids, stats) {
  const uniqueFunctionZids = [...new Set(functionZids)].sort();
  const report = analyzeSeeds(corpus, uniqueFunctionZids, { primitives: defaultVerifiedPrimitives });
  for (const result of report.results) {
    if (result.status === "composition_closed") {
      stats.compositionClosed += 1;
    } else if (result.status === "open_frontier") {
      stats.openFrontier += 1;
    } else if (result.status === "primitive") {
      stats.primitiveAnalysis += 1;
    }

    await writeSql(
      sqlite,
      insert(
        "analysis",
        [
          "seed_zid",
          "seed_kind",
          "status",
          "selected_implementation_zid",
          "functions_visited_count",
          "implementations_visited_count",
          "recursive_calls_count",
          "frontier_count",
          "primitives_json"
        ],
        [
          result.seed,
          result.seedKind,
          result.status,
          result.selectedImplementation,
          result.functionsVisited.length,
          result.implementationsVisited.length,
          result.recursiveCalls.length,
          result.frontier.length,
          stableStringify(report.primitives)
        ]
      )
    );

    for (let index = 0; index < result.functionsVisited.length; index += 1) {
      await writeSql(sqlite, insert("analysis_functions", ["seed_zid", "function_zid", "ordinal"], [
        result.seed,
        result.functionsVisited[index],
        index
      ]));
    }
    for (let index = 0; index < result.implementationsVisited.length; index += 1) {
      await writeSql(sqlite, insert("analysis_implementations", ["seed_zid", "implementation_zid", "ordinal"], [
        result.seed,
        result.implementationsVisited[index],
        index
      ]));
    }
    for (let index = 0; index < result.frontier.length; index += 1) {
      const frontier = result.frontier[index];
      await writeSql(
        sqlite,
        insert("analysis_frontier", ["seed_zid", "zid", "reason", "path", "details_json", "ordinal"], [
          result.seed,
          frontier.zid,
          frontier.reason,
          frontier.path,
          stableStringify(frontier),
          index
        ])
      );
    }
  }
}

export async function sqliteIndexStats(dbPath = DEFAULT_DB_PATH) {
  const sql = `
select
  (select count(*) from objects) as objects,
  (select count(*) from functions) as functions,
  (select count(*) from implementations) as implementations,
  (select count(*) from composition_calls) as composition_calls,
  (select count(*) from analysis where status = 'composition_closed') as composition_closed,
  (select count(*) from analysis where status = 'open_frontier') as open_frontier,
  (select count(*) from dynamic_calls) as dynamic_calls,
  (select count(*) from reference_edges) as reference_edges,
  (select count(*) from labels) as labels,
  (select count(*) from descriptions) as descriptions,
  (select count(*) from primitives) as primitives,
  (select count(*) from index_errors) as index_errors
`;
  const out = await runSqliteQuery(dbPath, sql, { format: "json" });
  return JSON.parse(out || "[]")[0] ?? {};
}

export async function runSqliteQuery(dbPath = DEFAULT_DB_PATH, sql, { format = "json" } = {}) {
  const args = [];
  if (format === "json") {
    args.push("-json");
  } else if (format === "csv") {
    args.push("-csv", "-header");
  } else if (format === "table") {
    args.push("-header", "-column");
  } else {
    throw new Error(`unsupported sqlite output format ${format}`);
  }
  args.push(path.resolve(dbPath), sql);
  return runSqlite(args);
}

export async function sqliteSchema(dbPath = DEFAULT_DB_PATH) {
  return runSqlite([path.resolve(dbPath), ".schema"]);
}

function schemaSql() {
  return `
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE objects (
  zid TEXT NOT NULL,
  revision INTEGER NOT NULL,
  latest INTEGER NOT NULL,
  type_zid TEXT,
  kind TEXT NOT NULL,
  digest TEXT,
  mediawiki_sha1 TEXT,
  timestamp TEXT,
  user TEXT,
  source TEXT,
  cache_path TEXT,
  canonical_json TEXT,
  error_code TEXT,
  error_message TEXT,
  PRIMARY KEY (zid, revision)
);
CREATE INDEX objects_kind_idx ON objects(kind);
CREATE INDEX objects_type_idx ON objects(type_zid);

CREATE TABLE functions (
  zid TEXT NOT NULL,
  revision INTEGER NOT NULL,
  return_type_json TEXT,
  implementation_count INTEGER NOT NULL,
  tester_count INTEGER NOT NULL,
  PRIMARY KEY (zid, revision)
);

CREATE TABLE function_implementations (
  function_zid TEXT NOT NULL,
  function_revision INTEGER NOT NULL,
  implementation_zid TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (function_zid, function_revision, implementation_zid)
);
CREATE INDEX function_implementations_impl_idx ON function_implementations(implementation_zid);

CREATE TABLE function_testers (
  function_zid TEXT NOT NULL,
  function_revision INTEGER NOT NULL,
  tester_zid TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (function_zid, function_revision, tester_zid)
);

CREATE TABLE implementations (
  zid TEXT NOT NULL,
  revision INTEGER NOT NULL,
  function_zid TEXT,
  body_kind TEXT NOT NULL,
  code_language TEXT,
  code_length INTEGER,
  builtin_reference_json TEXT,
  PRIMARY KEY (zid, revision)
);
CREATE INDEX implementations_function_idx ON implementations(function_zid);
CREATE INDEX implementations_body_kind_idx ON implementations(body_kind);

CREATE TABLE composition_calls (
  from_impl_zid TEXT NOT NULL,
  from_impl_revision INTEGER NOT NULL,
  to_function_zid TEXT NOT NULL,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (from_impl_zid, from_impl_revision, ordinal)
);
CREATE INDEX composition_calls_to_idx ON composition_calls(to_function_zid);

CREATE TABLE dynamic_calls (
  from_impl_zid TEXT NOT NULL,
  from_impl_revision INTEGER NOT NULL,
  path TEXT NOT NULL,
  term_json TEXT,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (from_impl_zid, from_impl_revision, ordinal)
);

CREATE TABLE reference_edges (
  from_zid TEXT NOT NULL,
  from_revision INTEGER NOT NULL,
  to_zid TEXT NOT NULL,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (from_zid, from_revision, ordinal)
);
CREATE INDEX reference_edges_to_idx ON reference_edges(to_zid);

CREATE TABLE labels (
  zid TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lang_zid TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (zid, revision, lang_zid, text)
);
CREATE INDEX labels_text_idx ON labels(text);

CREATE TABLE descriptions (
  zid TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lang_zid TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (zid, revision, lang_zid, text)
);

CREATE TABLE primitives (
  zid TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL,
  fstar_module TEXT,
  notes TEXT
);

CREATE TABLE analysis (
  seed_zid TEXT PRIMARY KEY,
  seed_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  selected_implementation_zid TEXT,
  functions_visited_count INTEGER NOT NULL,
  implementations_visited_count INTEGER NOT NULL,
  recursive_calls_count INTEGER NOT NULL,
  frontier_count INTEGER NOT NULL,
  primitives_json TEXT NOT NULL
);
CREATE INDEX analysis_status_idx ON analysis(status);

CREATE TABLE analysis_functions (
  seed_zid TEXT NOT NULL,
  function_zid TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (seed_zid, ordinal)
);
CREATE INDEX analysis_functions_function_idx ON analysis_functions(function_zid);

CREATE TABLE analysis_implementations (
  seed_zid TEXT NOT NULL,
  implementation_zid TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (seed_zid, ordinal)
);
CREATE INDEX analysis_implementations_impl_idx ON analysis_implementations(implementation_zid);

CREATE TABLE analysis_frontier (
  seed_zid TEXT NOT NULL,
  zid TEXT,
  reason TEXT NOT NULL,
  path TEXT,
  details_json TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (seed_zid, ordinal)
);
CREATE INDEX analysis_frontier_zid_idx ON analysis_frontier(zid);
CREATE INDEX analysis_frontier_reason_idx ON analysis_frontier(reason);

CREATE VIEW english_labels AS
  SELECT zid, revision, text
  FROM labels
  WHERE lang_zid = 'Z1002';

CREATE VIEW function_summary AS
  SELECT
    f.zid,
    coalesce(l.text, f.zid) AS english_label,
    f.revision,
    f.implementation_count,
    f.tester_count,
    a.status,
    a.selected_implementation_zid,
    a.frontier_count
  FROM functions f
  LEFT JOIN english_labels l ON l.zid = f.zid AND l.revision = f.revision
  LEFT JOIN analysis a ON a.seed_zid = f.zid;

CREATE TABLE index_errors (
  zid TEXT,
  revision INTEGER,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  path_json TEXT,
  details_json TEXT
);
`;
}

function objectColumns() {
  return [
    "zid",
    "revision",
    "latest",
    "type_zid",
    "kind",
    "digest",
    "mediawiki_sha1",
    "timestamp",
    "user",
    "source",
    "cache_path",
    "canonical_json",
    "error_code",
    "error_message"
  ];
}

async function writePrimitiveRows(sqlite) {
  const seen = new Set();
  for (const row of primitiveGrounding) {
    seen.add(row[0]);
    await writeSql(sqlite, insert("primitives", ["zid", "name", "status", "fstar_module", "notes"], row));
  }
  for (const zid of defaultVerifiedPrimitives) {
    if (seen.has(zid)) {
      continue;
    }
    await writeSql(sqlite, insert("primitives", ["zid", "name", "status", "fstar_module", "notes"], [
      zid,
      null,
      "configured_primitive",
      null,
      "Present in default composition-analysis primitive set"
    ]));
  }
}

function collectReferenceEdges(term, pathParts = ["$"], edges = []) {
  if (!term) {
    return edges;
  }
  if (term.kind === "ref") {
    edges.push({ toZid: term.zid, path: pathParts.join(".") });
    return edges;
  }
  if (term.kind === "record") {
    for (const [key, value] of term.fields) {
      collectReferenceEdges(value, pathParts.concat(key), edges);
    }
  }
  return edges;
}

function extractMultilingualTexts(canonical, field) {
  const multilingual = canonical?.[field];
  const list = multilingual?.Z12K1;
  if (!Array.isArray(list)) {
    return [];
  }
  const rows = [];
  for (const item of list.slice(1)) {
    const lang = canonicalZid(item?.Z11K1);
    const text = canonicalString(item?.Z11K2);
    if (lang && text !== undefined) {
      rows.push({ lang, text });
    }
  }
  return rows;
}

function canonicalZid(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string") {
    return value.Z9K1;
  }
  return undefined;
}

function canonicalString(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value?.Z1K1 === "Z6" && typeof value.Z6K1 === "string") {
    return value.Z6K1;
  }
  return undefined;
}

function insert(table, columns, values) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map(sqlValue).join(", ")});\n`;
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function writeSql(sqlite, text) {
  if (!sqlite.stdin.write(text, "utf8")) {
    await new Promise((resolve) => sqlite.stdin.once("drain", resolve));
  }
}

async function runSqlite(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`sqlite3 failed with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
}

function emptyBuildStats(dbPath, cacheDir) {
  return {
    dbPath,
    cacheDir,
    objects: 0,
    functions: 0,
    implementations: 0,
    compositionCalls: 0,
    dynamicCalls: 0,
    referenceEdges: 0,
    compositionClosed: 0,
    openFrontier: 0,
    primitiveAnalysis: 0,
    labels: 0,
    descriptions: 0,
    errors: 0
  };
}

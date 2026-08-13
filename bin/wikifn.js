#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzeSeeds,
  buildWorld,
  buildSqliteIndex,
  checkStructural,
  evaluate,
  evaluationSummary,
  fetchAnalysisCorpus,
  importMediaWikiXmlDump,
  loadSnapshotFile,
  normalizeCanonical,
  parsePrimitiveOption,
  parseJsonStrict,
  runSqliteQuery,
  sqliteIndexStats,
  sqliteSchema,
  toCanonicalJson,
  toNormalJson,
  WikifunctionsCache
} from "../src/index.js";
import { formatError } from "../src/result.js";

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "normalize":
      await normalizeCommand(args);
      break;
    case "check":
      await checkCommand(args);
      break;
    case "check-world":
      await checkWorldCommand(args);
      break;
    case "eval":
      await evalCommand(args);
      break;
    case "eval-example":
      await evalCommand(["examples/add-snapshot.json", "examples/add-call.json", ...args]);
      break;
    case "fstar-demo":
      await fstarDemoCommand(args);
      break;
    case "fstar-call":
      await fstarCallCommand(args);
      break;
    case "analyze":
      await analyzeCommand(args);
      break;
    case "analyze-demo":
      await analyzeCommand([
        "--max-objects",
        "100",
        "--primitive",
        "Z782,Z783,Z784,Z801,Z802,Z876,Z10000,Z13522,Z14003,Z14613,Z19706,Z19708",
        "Z20000",
        "Z15121",
        "Z21394",
        "Z22294",
        "Z38709",
        ...args
      ]);
      break;
    case "cache":
      await cacheCommand(args);
      break;
    case "db":
      await dbCommand(args);
      break;
    default:
      usage(command ? `unknown command ${command}` : undefined);
  }
} catch (error) {
  console.error(error.stack ?? String(error));
  process.exit(1);
}

async function normalizeCommand(args) {
  const [path, mode = "canonical"] = args;
  if (!path) {
    usage("normalize requires a JSON file");
  }
  const term = await readZObject(path);
  if (!term.ok) {
    fail(term.error);
  }
  const value = mode === "normal" ? toNormalJson(term.value) : toCanonicalJson(term.value);
  printJson(value);
}

async function checkCommand(args) {
  const [path] = args;
  if (!path) {
    usage("check requires a JSON file");
  }
  const term = await readZObject(path);
  if (!term.ok) {
    fail(term.error);
  }
  const structural = checkStructural(term.value);
  if (!structural.ok) {
    fail(structural.error);
  }
  printJson({ ok: true });
}

async function checkWorldCommand(args) {
  const [path] = args;
  if (!path) {
    usage("check-world requires a snapshot file");
  }
  const world = await loadSnapshotFile(path);
  if (!world.ok) {
    fail(world.error);
  }
  printJson({
    ok: true,
    objects: world.value.objects.size,
    compositionImplementations: [...world.value.implementations.entries()].map(([functionZid, implementations]) => ({
      functionZid,
      implementations: implementations.map((implementation) => implementation.zid)
    }))
  });
}

async function evalCommand(args) {
  const parsed = parseEvalArgs(args);
  const { snapshotPath, callPath, fuel, trace, profile } = parsed;
  if (!snapshotPath || !callPath) {
    usage("eval requires a snapshot file and a call file");
  }

  const world = await loadSnapshotFile(snapshotPath);
  if (!world.ok) {
    fail(world.error);
  }
  const call = await readZObject(callPath);
  if (!call.ok) {
    fail(call.error);
  }
  const structural = checkStructural(call.value);
  if (!structural.ok) {
    fail(structural.error);
  }

  const startMemory = profile ? process.memoryUsage() : undefined;
  const start = profile ? process.hrtime.bigint() : undefined;
  const result = evaluate(world.value, call.value, { fuel });
  const elapsedMs = profile ? Number(process.hrtime.bigint() - start) / 1_000_000 : undefined;
  const endMemory = profile ? process.memoryUsage() : undefined;
  if (!result.ok) {
    fail(result.error);
  }
  const summary = evaluationSummary(result, { trace });
  if (!summary.ok) {
    fail(summary.error);
  }
  if (profile) {
    summary.value.profile = {
      elapsedMs: Number(elapsedMs.toFixed(3)),
      memory: {
        rssDeltaBytes: endMemory.rss - startMemory.rss,
        heapUsedDeltaBytes: endMemory.heapUsed - startMemory.heapUsed
      }
    };
  }
  printJson(summary.value);
}

async function analyzeCommand(args) {
  const parsed = parseAnalyzeArgs(args);
  if (parsed.zids.length === 0) {
    usage("analyze requires at least one ZID");
  }
  const corpus = await fetchAnalysisCorpus(parsed.zids, {
    maxObjects: parsed.maxObjects,
    maxNetworkObjects: parsed.maxNetworkObjects,
    followCompositionCalls: parsed.followCompositionCalls,
    api: parsed.api
  });
  if (!corpus.ok) {
    fail(corpus.error);
  }
  const report = analyzeSeeds(corpus.value, parsed.zids, {
    primitives: parsed.primitives
  });
  if (parsed.output === "json") {
    printJson(report);
  } else {
    console.log(formatAnalysisReport(report, parsed));
  }
}

async function readZObject(path) {
  const text = await readFile(path, "utf8");
  const parsed = parseJsonStrict(text);
  if (!parsed.ok) {
    return parsed;
  }
  return normalizeCanonical(parsed.value);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(error) {
  console.error(formatError(error));
  if (error.details && Object.keys(error.details).length > 0) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
}

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(`Usage:
  wikifn normalize <zobject.json> [canonical|normal]
  wikifn check <zobject.json>
  wikifn check-world <snapshot.json>
  wikifn eval <snapshot.json> <call.json> [fuel] [--trace] [--profile]
  wikifn eval-example [fuel] [--trace] [--profile]
  wikifn fstar-demo
  wikifn fstar-call [--mode generated|compiled|specialized] [--fuel N] <zid> <text-arg...>
  wikifn analyze [--json] [--primitive Z1,Z2] [--max-objects N] [--max-network-objects N] [--follow-calls] [--live|--refresh-cache|--offline|--no-cache] <zid...>
  wikifn analyze-demo [--json]
  wikifn cache stats [--cache-dir DIR]
  wikifn cache fetch [analyze-options] <zid...>
  wikifn cache import <content-download-dir> [--cache-dir DIR] [--limit N] [zid...]
  wikifn cache import-xml <pages-meta-current.xml[.bz2|.gz]> [--cache-dir DIR] [--limit N]
  wikifn db build [--cache-dir DIR] [--db PATH] [--include-json] [--all-revisions] [--analyze]
  wikifn db stats [--db PATH]
  wikifn db schema [--db PATH]
  wikifn db query [--db PATH] [--format json|table|csv] <sql>`);
  process.exit(message ? 1 : 0);
}

async function fstarDemoCommand(args) {
  if (args.length > 0) {
    usage("fstar-demo does not accept arguments");
  }
  const artifact = path.resolve("docs/generated/wikifn_primitives_demo.cjs");
  await spawnNodeArtifact(artifact, []);
}

async function fstarCallCommand(args) {
  const artifact = path.resolve("docs/generated/wikifn_call.cjs");
  await spawnNodeArtifact(artifact, args);
}

async function spawnNodeArtifact(artifact, args) {
  const child = spawn(process.execPath, [artifact, ...args], { stdio: "inherit" });
  const exit = await new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  if (exit.signal) {
    process.kill(process.pid, exit.signal);
  }
  if (exit.code !== 0) {
    process.exit(exit.code ?? 1);
  }
}

function parseEvalArgs(args) {
  let trace = false;
  let profile = false;
  const positional = [];

  for (const arg of args) {
    if (arg === "--trace" || arg === "--debug") {
      trace = true;
      continue;
    }
    if (arg === "--profile") {
      profile = true;
      continue;
    }
    if (arg.startsWith("--")) {
      usage(`unknown eval option ${arg}`);
    }
    positional.push(arg);
  }

  const [snapshotPath, callPath, fuelText] = positional;
  const fuel = fuelText === undefined ? 100 : Number(fuelText);
  if (!Number.isSafeInteger(fuel) || fuel < 0) {
    usage("fuel must be a non-negative integer");
  }
  return { snapshotPath, callPath, fuel, trace, profile };
}

function parseAnalyzeArgs(args) {
  let primitives;
  let maxObjects = 300;
  let maxNetworkObjects;
  let followCompositionCalls = false;
  let output = "text";
  const api = { cacheMode: "offline" };
  let cacheModeExplicit = false;
  const zids = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--primitive" || arg === "--primitives") {
      const value = args[++index];
      if (value === undefined) {
        usage(`${arg} requires a comma-separated ZID list`);
      }
      primitives = parsePrimitiveOption(value);
      continue;
    }
    if (arg === "--max-objects") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value <= 0) {
        usage("--max-objects requires a positive integer");
      }
      maxObjects = value;
      continue;
    }
    if (arg === "--max-network-objects") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value < 0) {
        usage("--max-network-objects requires a non-negative integer");
      }
      maxNetworkObjects = value;
      continue;
    }
    if (arg === "--follow-calls") {
      followCompositionCalls = true;
      continue;
    }
    if (arg === "--cache-dir") {
      const value = args[++index];
      if (!value) {
        usage("--cache-dir requires a path");
      }
      api.cacheDir = value;
      continue;
    }
    if (arg === "--refresh-cache") {
      api.cacheMode = "refresh";
      cacheModeExplicit = true;
      continue;
    }
    if (arg === "--live") {
      api.cacheMode = "trust";
      cacheModeExplicit = true;
      continue;
    }
    if (arg === "--offline") {
      api.cacheMode = "offline";
      cacheModeExplicit = true;
      continue;
    }
    if (arg === "--no-cache") {
      api.cache = false;
      cacheModeExplicit = true;
      continue;
    }
    if (arg === "--json") {
      output = "json";
      continue;
    }
    if (arg === "--format") {
      const value = args[++index];
      if (value !== "json" && value !== "text") {
        usage("--format requires json or text");
      }
      output = value;
      continue;
    }
    if (arg.startsWith("--")) {
      usage(`unknown analyze option ${arg}`);
    }
    zids.push(arg);
  }

  return {
    primitives,
    maxObjects,
    maxNetworkObjects,
    followCompositionCalls,
    api,
    cacheModeExplicit,
    output,
    zids
  };
}

async function cacheCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "stats") {
    const parsed = parseCacheArgs(rest);
    const cache = new WikifunctionsCache(parsed.cacheDir);
    printJson(await cache.stats());
    return;
  }
  if (subcommand === "fetch") {
    const parsed = parseAnalyzeArgs(rest);
    if (parsed.zids.length === 0) {
      usage("cache fetch requires at least one ZID");
    }
    const corpus = await fetchAnalysisCorpus(parsed.zids, {
      maxObjects: parsed.maxObjects,
      maxNetworkObjects: parsed.maxNetworkObjects,
      followCompositionCalls: parsed.followCompositionCalls,
      api: { ...parsed.api, cacheMode: parsed.cacheModeExplicit ? parsed.api.cacheMode : "refresh" }
    });
    if (!corpus.ok) {
      fail(corpus.error);
    }
    const cache = new WikifunctionsCache(parsed.api.cacheDir);
    printJson({
      ok: true,
      fetchedObjects: corpus.value.objects.size,
      cache: await cache.stats()
    });
    return;
  }
  if (subcommand === "import") {
    await cacheImportCommand(rest);
    return;
  }
  if (subcommand === "import-xml") {
    await cacheImportXmlCommand(rest);
    return;
  }
  usage("cache requires stats or fetch");
}

async function dbCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "build") {
    const parsed = parseDbBuildArgs(rest);
    const stats = await buildSqliteIndex(parsed);
    printJson({ ok: true, ...stats });
    return;
  }
  if (subcommand === "stats") {
    const parsed = parseDbArgs(rest);
    printJson(await sqliteIndexStats(parsed.dbPath));
    return;
  }
  if (subcommand === "schema") {
    const parsed = parseDbArgs(rest);
    process.stdout.write(await sqliteSchema(parsed.dbPath));
    return;
  }
  if (subcommand === "query") {
    const parsed = parseDbQueryArgs(rest);
    if (!parsed.sql) {
      usage("db query requires a SQL argument");
    }
    process.stdout.write(await runSqliteQuery(parsed.dbPath, parsed.sql, { format: parsed.format }));
    return;
  }
  usage("db requires build, stats, schema, or query");
}

function parseCacheArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cache-dir") {
      const value = args[++index];
      if (!value) {
        usage("--cache-dir requires a path");
      }
      parsed.cacheDir = value;
      continue;
    }
    usage(`unknown cache option ${arg}`);
  }
  return parsed;
}

function parseDbArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--db") {
      const value = args[++index];
      if (!value) {
        usage("--db requires a path");
      }
      parsed.dbPath = value;
      continue;
    }
    usage(`unknown db option ${arg}`);
  }
  return parsed;
}

function parseDbBuildArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--db") {
      const value = args[++index];
      if (!value) {
        usage("--db requires a path");
      }
      parsed.dbPath = value;
      continue;
    }
    if (arg === "--cache-dir") {
      const value = args[++index];
      if (!value) {
        usage("--cache-dir requires a path");
      }
      parsed.cacheDir = value;
      continue;
    }
    if (arg === "--include-json") {
      parsed.includeJson = true;
      continue;
    }
    if (arg === "--all-revisions") {
      parsed.allRevisions = true;
      continue;
    }
    if (arg === "--analyze") {
      parsed.analyze = true;
      continue;
    }
    usage(`unknown db build option ${arg}`);
  }
  return parsed;
}

function parseDbQueryArgs(args) {
  const parsed = { format: "json" };
  const sql = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--db") {
      const value = args[++index];
      if (!value) {
        usage("--db requires a path");
      }
      parsed.dbPath = value;
      continue;
    }
    if (arg === "--format") {
      const value = args[++index];
      if (value !== "json" && value !== "table" && value !== "csv") {
        usage("--format requires json, table, or csv");
      }
      parsed.format = value;
      continue;
    }
    sql.push(arg);
  }
  parsed.sql = sql.join(" ");
  return parsed;
}

async function cacheImportCommand(args) {
  const parsed = parseCacheImportArgs(args);
  if (!parsed.dir) {
    usage("cache import requires a content-download directory");
  }
  const indexPath = path.join(parsed.dir, "Z0.json");
  const index = parseJsonStrict(await readFile(indexPath, "utf8"));
  if (!index.ok) {
    fail(index.error);
  }
  const cache = new WikifunctionsCache(parsed.cacheDir);
  const requested = parsed.zids.length > 0 ? new Set(parsed.zids) : undefined;
  const imported = [];

  for (const [zid, revisionValue] of Object.entries(index.value)) {
    if (requested && !requested.has(zid)) {
      continue;
    }
    if (parsed.limit !== undefined && imported.length >= parsed.limit) {
      break;
    }
    const revision = Number(revisionValue);
    if (!Number.isSafeInteger(revision)) {
      continue;
    }
    const canonical = await readContentDownloadObject(parsed.dir, zid, revision);
    if (!canonical) {
      continue;
    }
    await cache.put({
      zid,
      revision,
      canonical,
      source: "wikifunctions-content-download"
    });
    imported.push(`${zid}@${revision}`);
  }

  printJson({
    ok: true,
    imported,
    cache: await cache.stats()
  });
}

async function cacheImportXmlCommand(args) {
  const parsed = parseCacheArgsWithFile(args, "cache import-xml requires a dump XML file");
  const result = await importMediaWikiXmlDump(parsed.file, { cacheDir: parsed.cacheDir, limit: parsed.limit });
  if (!result.ok) {
    fail(result.error);
  }
  const cache = new WikifunctionsCache(parsed.cacheDir);
  printJson({
    ok: true,
    ...result.value,
    cache: await cache.stats()
  });
}

function parseCacheArgsWithFile(args, missingMessage) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cache-dir") {
      const value = args[++index];
      if (!value) {
        usage("--cache-dir requires a path");
      }
      parsed.cacheDir = value;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value <= 0) {
        usage("--limit requires a positive integer");
      }
      parsed.limit = value;
      continue;
    }
    if (arg.startsWith("--")) {
      usage(`unknown cache option ${arg}`);
    }
    if (parsed.file) {
      usage(`unexpected extra argument ${arg}`);
    }
    parsed.file = arg;
  }
  if (!parsed.file) {
    usage(missingMessage);
  }
  return parsed;
}

function parseCacheImportArgs(args) {
  const parsed = { zids: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cache-dir") {
      const value = args[++index];
      if (!value) {
        usage("--cache-dir requires a path");
      }
      parsed.cacheDir = value;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value <= 0) {
        usage("--limit requires a positive integer");
      }
      parsed.limit = value;
      continue;
    }
    if (arg.startsWith("--")) {
      usage(`unknown cache import option ${arg}`);
    }
    if (!parsed.dir) {
      parsed.dir = arg;
    } else {
      parsed.zids.push(arg);
    }
  }
  return parsed;
}

async function readContentDownloadObject(dir, zid, revision) {
  for (const suffix of ["json", "done.json"]) {
    const file = path.join(dir, `${zid}.${revision}.${suffix}`);
    try {
      const parsed = parseJsonStrict(await readFile(file, "utf8"));
      if (!parsed.ok) {
        return undefined;
      }
      return parsed.value.canonical ?? parsed.value;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return undefined;
}

function formatAnalysisReport(report, options) {
  const lines = [];
  lines.push(`Analyzed ${report.seeds.join(", ")}`);
  lines.push(`Fetched ${report.fetchedObjects} pinned object${report.fetchedObjects === 1 ? "" : "s"}.`);
  lines.push(`Primitive policy: ${report.primitives.length > 0 ? report.primitives.join(", ") : "(none)"}.`);
  lines.push(`Composition call expansion: ${options.followCompositionCalls ? "on" : "off"}; max objects: ${options.maxObjects}.`);
  if (options.maxNetworkObjects !== undefined) {
    lines.push(`Network object fetch cap: ${options.maxNetworkObjects}. Cached objects do not count against this cap.`);
  }
  lines.push(`Cache mode: ${options.api.cache === false ? "off" : options.api.cacheMode ?? "trust"}.`);
  lines.push("");

  for (const result of report.results) {
    const object = report.objects[result.seed];
    lines.push(`${result.seed}: ${statusLabel(result.status)}`);
    if (object?.revision !== undefined) {
      lines.push(`  object: ${object.kind} ${object.ztype}@${object.revision}`);
    }
    if (result.selectedImplementation) {
      const impl = report.objects[result.selectedImplementation];
      const revision = impl?.revision !== undefined ? `@${impl.revision}` : "";
      lines.push(`  selected composition: ${result.selectedImplementation}${revision}`);
    } else {
      lines.push("  selected composition: none");
    }
    if (result.functionsVisited.length > 0) {
      lines.push(`  functions visited: ${result.functionsVisited.join(", ")}`);
    }
    if (result.implementationsVisited.length > 0) {
      lines.push(`  composition implementations visited: ${result.implementationsVisited.join(", ")}`);
    }
    if (result.recursiveCalls.length > 0) {
      lines.push(`  recursive calls: ${result.recursiveCalls.map((call) => call.functionZid ?? call.implementationZid).join(", ")}`);
    }
    if (result.frontier.length === 0) {
      lines.push("  frontier: empty");
      lines.push("  meaning: compositionally closed relative to the primitive policy above.");
    } else {
      lines.push("  frontier:");
      for (const item of result.frontier) {
        lines.push(`    - ${formatFrontierItem(item)}`);
      }
      lines.push("  meaning: not compositionally closed under this fetch/primitive policy.");
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function statusLabel(status) {
  if (status === "composition_closed") {
    return "compositionally closed";
  }
  if (status === "open_frontier") {
    return "open frontier";
  }
  return status;
}

function formatFrontierItem(item) {
  if (item.reason === "missing_object") {
    return `${item.zid}: not fetched or not present in the corpus`;
  }
  if (item.reason === "no_composition_implementation") {
    const impls = (item.implementations ?? []).map((impl) => `${impl.zid}:${impl.bodyKind}`).join(", ");
    return `${item.zid}: no Z14K2 composition implementation found${impls ? `; implementations: ${impls}` : ""}`;
  }
  if (item.reason?.startsWith("implementation_")) {
    return `${item.zid}: implementation body is ${item.reason.slice("implementation_".length)}`;
  }
  if (item.reason === "dynamic_call") {
    return `${item.zid}: dynamic function call at ${item.path}`;
  }
  return `${item.zid}: ${item.reason}`;
}

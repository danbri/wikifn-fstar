#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import {
  analyzeSeeds,
  buildWorld,
  checkStructural,
  evaluate,
  evaluationSummary,
  fetchAnalysisCorpus,
  loadSnapshotFile,
  normalizeCanonical,
  parsePrimitiveOption,
  parseJsonStrict,
  toCanonicalJson,
  toNormalJson
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
      await evalCommand(["examples/add-snapshot.json", "examples/add-call.json"]);
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
        "Z38709"
      ]);
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
  const [snapshotPath, callPath, fuelText] = args;
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

  const fuel = fuelText === undefined ? 100 : Number(fuelText);
  if (!Number.isSafeInteger(fuel) || fuel < 0) {
    usage("fuel must be a non-negative integer");
  }

  const result = evaluate(world.value, call.value, { fuel });
  if (!result.ok) {
    fail(result.error);
  }
  const summary = evaluationSummary(result);
  if (!summary.ok) {
    fail(summary.error);
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
    followCompositionCalls: parsed.followCompositionCalls
  });
  if (!corpus.ok) {
    fail(corpus.error);
  }
  const report = analyzeSeeds(corpus.value, parsed.zids, {
    primitives: parsed.primitives
  });
  printJson(report);
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
  wikifn eval <snapshot.json> <call.json> [fuel]
  wikifn eval-example
  wikifn analyze [--primitive Z1,Z2] [--max-objects N] [--follow-calls] <zid...>
  wikifn analyze-demo`);
  process.exit(message ? 1 : 0);
}

function parseAnalyzeArgs(args) {
  let primitives;
  let maxObjects = 300;
  let followCompositionCalls = false;
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
    if (arg === "--follow-calls") {
      followCompositionCalls = true;
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
    followCompositionCalls,
    zids
  };
}

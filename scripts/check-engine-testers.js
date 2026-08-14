#!/usr/bin/env node
// Run every available Wikifunctions tester (Z20) against the extracted engine.
//
// A tester is only counted as passing when this harness can read both its call
// and its expected value. Anything else is skipped with a stated reason.
//
//   node scripts/check-engine-testers.js [--json] [--out FILE] [--fuel N]

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.join(root, "cache", "wikifunctions");

const objectCache = new Map();

async function loadCanonical(zid) {
  if (objectCache.has(zid)) return objectCache.get(zid);
  let result;
  try {
    const dir = path.join(cacheDir, "objects", zid);
    const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    files.sort((a, b) => Number(path.basename(a, ".json")) - Number(path.basename(b, ".json")));
    const entry = JSON.parse(await readFile(path.join(dir, files[files.length - 1]), "utf8"));
    result = { canonical: entry.canonical, revision: entry.revision };
  } catch {
    result = undefined;
  }
  objectCache.set(zid, result);
  return result;
}

const refZid = (value) => {
  if (typeof value === "string" && /^Z[1-9][0-9]*$/.test(value)) return value;
  if (value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string") return value.Z9K1;
  return undefined;
};

// Resolves a canonical value to a plain JSON argument the engine accepts:
// a string, a natural number, a boolean, or a list of those.
async function toArgument(value, depth = 0) {
  if (depth > 8) return undefined;
  if (typeof value === "string") {
    if (/^Z[1-9][0-9]*$/.test(value)) {
      const target = await loadCanonical(value);
      if (!target) return undefined;
      return toArgument(target.canonical.Z2K2, depth + 1);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const items = [];
    for (const item of value.slice(1)) {
      const converted = await toArgument(item, depth + 1);
      if (converted === undefined) return undefined;
      items.push(converted);
    }
    return items;
  }
  if (!value || typeof value !== "object") return undefined;
  const type = refZid(value.Z1K1);
  if (type === "Z6") return typeof value.Z6K1 === "string" ? value.Z6K1 : undefined;
  if (type === "Z9") return toArgument(value.Z9K1, depth + 1);
  if (type === "Z13518" || type === "Z10") {
    const raw = value.Z13518K1 ?? value.Z10K1;
    const text = typeof raw === "string" ? raw : raw?.Z6K1;
    return /^[0-9]+$/.test(text ?? "") ? Number(text) : undefined;
  }
  if (type === "Z40") {
    const identity = refZid(value.Z40K1);
    if (identity === "Z41") return true;
    if (identity === "Z42") return false;
    return undefined;
  }
  return undefined;
}

function callArguments(call) {
  return Object.keys(call)
    .filter((key) => key !== "Z1K1" && key !== "Z7K1")
    .sort((a, b) => Number(a.split("K")[1]) - Number(b.split("K")[1]))
    .map((key) => call[key]);
}

// Reads what the tester expects. The validator is a call with one argument
// left empty for the result under test.
async function expectationOf(validator) {
  const validatorZid = refZid(validator?.Z7K1);
  const supplied = Object.keys(validator ?? {})
    .filter((key) => key !== "Z1K1" && key !== "Z7K1")
    .map((key) => validator[key]);
  if (supplied.length !== 1) {
    return { kind: "unsupported", reason: `${validatorZid ?? "?"} with ${supplied.length} supplied arguments` };
  }
  if (validatorZid !== "Z866" && validatorZid !== "Z844" && validatorZid !== "Z13522") {
    return { kind: "unsupported", reason: `validator ${validatorZid ?? "?"}` };
  }
  const expected = await toArgument(supplied[0]);
  if (expected === undefined) {
    return { kind: "unsupported", reason: `${validatorZid} expected value is not readable` };
  }
  return { kind: "equals", expected };
}

// Compares an engine result envelope against an expected plain value.
function matches(result, expected) {
  if (result === undefined || result === null) return false;
  if (result.type === "Z6") return result.text === expected;
  if (result.type === "Z40") return result.value === expected;
  if (result.type === "Z13518") return Number(result.value) === Number(expected);
  if (result.type === "Z881") {
    if (!Array.isArray(expected) || result.items.length !== expected.length) return false;
    return result.items.every((item, index) => matches(item, expected[index]));
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const outFile = valueOf(args, "--out");
  const fuel = valueOf(args, "--fuel") ?? "5000";
  // Report any single evaluation slower than this, so a pathological case can
  // be found without waiting for the whole sweep.
  const slowMs = Number(valueOf(args, "--slow-ms") ?? 0);
  const trace = args.includes("--trace");

  require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));
  const catalog = require(path.join(root, "docs", "generated", "functions.json"));
  const supported = new Map(catalog.functions.map((entry) => [entry.zid, entry]));

  const list = [...supported.keys()].map((zid) => `'${zid}'`).join(",");
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(root, "bin", "wikifn.js"), "db", "query", "--format", "json",
      `select function_zid, tester_zid from function_testers where function_zid in (${list})`
    ],
    { maxBuffer: 256 * 1024 * 1024 }
  );
  const limit = Number(valueOf(args, "--limit") ?? 0);
  const rows = limit ? JSON.parse(stdout).slice(0, limit) : JSON.parse(stdout);

  const cases = [];
  for (const row of rows) {
    const tester = await loadCanonical(row.tester_zid);
    const body = tester?.canonical?.Z2K2;
    if (refZid(body?.Z1K1) !== "Z20") {
      cases.push({ ...row, status: "skipped", reason: "tester object unreadable" });
      continue;
    }
    const expectation = await expectationOf(body.Z20K3);
    if (expectation.kind === "unsupported") {
      cases.push({ ...row, status: "skipped", reason: expectation.reason });
      continue;
    }
    const rawArgs = callArguments(body.Z20K2 ?? {});
    const converted = [];
    let readable = true;
    for (const argument of rawArgs) {
      const value = await toArgument(argument);
      if (value === undefined) { readable = false; break; }
      converted.push(value);
    }
    if (!readable) {
      cases.push({ ...row, status: "skipped", reason: "argument is not a readable literal" });
      continue;
    }

    let response;
    // Written before the call, so a stall names the case that caused it.
    if (trace) process.stderr.write(`> ${row.function_zid} ${row.tester_zid}\n`);
    const startedAt = Date.now();
    try {
      response = JSON.parse(
        globalThis.wikifnEngineCall(row.function_zid, fuel, JSON.stringify(converted))
      );
      const elapsed = Date.now() - startedAt;
      if (slowMs > 0 && elapsed > slowMs) {
        console.error(`slow ${elapsed}ms ${row.function_zid} ${row.tester_zid} ${JSON.stringify(converted).slice(0, 80)}`);
      }
    } catch (error) {
      cases.push({ ...row, status: "error", reason: String(error.message ?? error) });
      continue;
    }
    if (!response.ok) {
      cases.push({ ...row, status: "error", reason: response.message ?? "evaluation failed", input: converted });
      continue;
    }
    const ok = matches(response.result, expectation.expected);
    cases.push({
      ...row,
      status: ok ? "pass" : "fail",
      input: converted,
      expected: expectation.expected,
      actual: response.result
    });
  }

  // Sample arguments for the demo page, taken from the testers this sweep just
  // read. Written here rather than by a separate script so there is one piece
  // of code that knows how to turn a tester's call into engine arguments; a
  // second copy would drift, and a wrong example is worse than none.
  //
  // Ordered so a visitor sees a case that works first: passing, then any that
  // was at least readable. The expected value comes along when the tester
  // stated one, so the page can say what the answer should be.
  const examplesFile = valueOf(args, "--examples");
  if (examplesFile) {
    const rank = { pass: 0, fail: 1, error: 2 };
    const byFunction = new Map();
    for (const entry of cases) {
      if (!(entry.status in rank) || !Array.isArray(entry.input)) continue;
      const list = byFunction.get(entry.function_zid) ?? [];
      list.push(entry);
      byFunction.set(entry.function_zid, list);
    }
    const examples = {};
    for (const [zid, list] of byFunction) {
      list.sort((a, b) => rank[a.status] - rank[b.status]);
      const seen = new Set();
      const picked = [];
      for (const entry of list) {
        const key = JSON.stringify(entry.input);
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push({
          args: entry.input,
          ...(entry.expected === undefined ? {} : { expected: entry.expected }),
          tester: entry.tester_zid,
          status: entry.status
        });
        if (picked.length === 4) break;
      }
      if (picked.length) examples[zid] = picked;
    }
    await writeFile(
      examplesFile,
      JSON.stringify(
        {
          generated: "scripts/check-engine-testers.js --examples",
          note: "Arguments taken from Wikifunctions' own Z20 testers. status says what "
            + "this engine did with them, so 'error' means the example is real and the "
            + "engine cannot yet run it.",
          functions: Object.keys(examples).length,
          examples
        },
        null,
        2
      ),
      "utf8"
    );
    console.error(`${Object.keys(examples).length} functions have example arguments -> ${examplesFile}`);
  }

  const tally = (status) => cases.filter((entry) => entry.status === status).length;
  const functionsWithPass = new Set(cases.filter((c) => c.status === "pass").map((c) => c.function_zid));
  const functionsWithFail = new Set(cases.filter((c) => c.status === "fail" || c.status === "error").map((c) => c.function_zid));

  const reasons = new Map();
  for (const entry of cases) {
    if (entry.status === "skipped" || entry.status === "error") {
      reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    }
  }

  const report = {
    functionsInEngine: supported.size,
    testersConsidered: cases.length,
    counts: {
      pass: tally("pass"),
      fail: tally("fail"),
      error: tally("error"),
      skipped: tally("skipped")
    },
    functionsWithAtLeastOnePass: functionsWithPass.size,
    functionsFullyPassing: [...functionsWithPass].filter((zid) => !functionsWithFail.has(zid)).length,
    topReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count).slice(0, 15),
    failures: cases.filter((entry) => entry.status === "fail" || entry.status === "error").slice(0, 60)
  };

  if (outFile) await writeFile(outFile, JSON.stringify({ report, cases }, null, 2), "utf8");
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }

  console.log(`engine functions:      ${report.functionsInEngine}`);
  console.log(`testers considered:    ${report.testersConsidered}`);
  console.log(`pass ${report.counts.pass}  fail ${report.counts.fail}  error ${report.counts.error}  skipped ${report.counts.skipped}`);
  console.log(`functions with a passing tester: ${report.functionsWithAtLeastOnePass}`);
  console.log(`functions passing every readable tester: ${report.functionsFullyPassing}`);
  console.log("\nskip and error reasons:");
  for (const row of report.topReasons) console.log(`  ${String(row.count).padStart(5)}  ${row.reason}`);
}

function valueOf(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

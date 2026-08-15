#!/usr/bin/env node
// Call every function in the catalogue on its tester examples, through the
// interpreter, and record anything that does not come back as a result.
//
// The rule this checks is the one `Wikifn.Eval` states about itself: a library
// must not crash its caller. Fuel and the depth limit exist so that a
// non-productive composition is *reported*, and a report is a value the caller
// can read. A JavaScript stack overflow is not - it is an exception thrown
// through the whole extracted engine, and no amount of fuel accounting makes it
// one.
//
// It runs as its own process for the same reason `compiled-sweep.js` does: a
// call that does not return cannot be interrupted from inside, so progress is
// written before each call and a caller with a deadline can say which one.
//
//   node scripts/interpreter-sweep.js [--progress FILE] [--fuel N] [--slow-ms N] [--json]

import { createRequire } from "node:module";
import { openSync, writeSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const progressPath = valueOf("--progress");
const fuel = valueOf("--fuel") ?? "100000";
const slowMs = Number(valueOf("--slow-ms") ?? 2000);
const asJson = args.includes("--json");

require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));
const catalogue = require(path.join(root, "docs", "generated", "functions.json"));
const examples = require(path.join(root, "docs", "generated", "examples.json")).examples;

const progress = progressPath ? openSync(progressPath, "w") : undefined;
const note = (line) => { if (progress !== undefined) writeSync(progress, line + "\n"); };

const threw = [];
const slow = [];
let calls = 0;
let totalMs = 0;

for (const entry of catalogue.functions) {
  for (const sample of (examples[entry.zid] ?? []).slice(0, 3)) {
    const payload = JSON.stringify(sample.args);
    note(`${entry.zid} ${payload.slice(0, 80)}`);
    const started = Date.now();
    try {
      globalThis.wikifnEngineCall(entry.zid, fuel, payload);
    } catch (error) {
      threw.push({
        zid: entry.zid, label: entry.label,
        error: String(error?.message ?? error), args: sample.args
      });
    }
    const elapsed = Date.now() - started;
    calls += 1;
    totalMs += elapsed;
    if (elapsed >= slowMs) slow.push({ zid: entry.zid, label: entry.label, ms: elapsed });
  }
}

note("done");
if (progress !== undefined) closeSync(progress);

slow.sort((a, b) => b.ms - a.ms);
const report = {
  calls, totalMs, fuel: Number(fuel), slowMs,
  threw: threw.slice(0, 20), threwCount: threw.length,
  slow: slow.slice(0, 20), slowCount: slow.length
};
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${calls} interpreted calls in ${totalMs} ms at fuel ${fuel}`);
  console.log(`${threw.length} threw rather than returning a result:`);
  for (const row of report.threw) console.log(`  ${row.zid} ${row.label}: ${row.error}`);
  console.log(`${slow.length} took ${slowMs} ms or more:`);
  for (const row of report.slow) console.log(`  ${String(row.ms).padStart(7)} ms  ${row.zid} ${row.label}`);
}

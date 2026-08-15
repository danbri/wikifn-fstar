#!/usr/bin/env node
// Call every compiled function on its tester examples, and time each one.
//
// This exists as its own process because of how the failure it looks for
// behaves. A compiled function that spends too much fuel does not return, and a
// synchronous call cannot be interrupted from inside the same process - so a
// test that ran the sweep in-process would hang rather than report, which is
// what happened: `Z11053` took longer than five minutes and the whole suite sat
// on it with nothing printed.
//
// So progress is written to a file as it goes, one line per call, flushed. A
// caller can kill this process and read the last line to learn which call did
// not come back. `test/compiled.test.js` does exactly that.
//
//   node scripts/compiled-sweep.js [--progress FILE] [--slow-ms N] [--json]

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
const slowMs = Number(valueOf("--slow-ms") ?? 1000);
const asJson = args.includes("--json");

require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));
const catalogue = require(path.join(root, "docs", "generated", "functions.json"));
const examples = require(path.join(root, "docs", "generated", "examples.json")).examples;

const progress = progressPath ? openSync(progressPath, "w") : undefined;
const note = (line) => { if (progress !== undefined) writeSync(progress, line + "\n"); };

const slow = [];
// A compiled function must not take its caller down. Fuel bounds the recursion
// depth, and a level is a stack frame here, so a budget larger than the stack
// turns a limit into a crash - which is what a throw from one of these is.
const threw = [];
let calls = 0;
let totalMs = 0;

for (const entry of catalogue.functions) {
  if (!entry.compiled) continue;
  for (const sample of (examples[entry.zid] ?? []).slice(0, 2)) {
    const payload = JSON.stringify(sample.args);
    note(`${entry.zid} ${payload.slice(0, 80)}`);
    const started = Date.now();
    try {
      globalThis.wikifnCompiledCall(entry.zid, payload);
    } catch (error) {
      threw.push({ zid: entry.zid, label: entry.label, error: String(error?.message ?? error) });
    }
    const elapsed = Date.now() - started;
    calls += 1;
    totalMs += elapsed;
    if (elapsed >= slowMs) slow.push({ zid: entry.zid, label: entry.label, ms: elapsed, args: sample.args });
  }
}

note("done");
if (progress !== undefined) closeSync(progress);

slow.sort((a, b) => b.ms - a.ms);
const report = {
  calls, totalMs, slowMs,
  slow: slow.slice(0, 20), slowCount: slow.length,
  threw: threw.slice(0, 20), threwCount: threw.length
};
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${calls} compiled calls in ${totalMs} ms`);
  console.log(`${slow.length} took ${slowMs} ms or more:`);
  for (const row of report.slow) console.log(`  ${String(row.ms).padStart(7)} ms  ${row.zid} ${row.label}`);
  console.log(`${threw.length} threw rather than returning a result:`);
  for (const row of report.threw) console.log(`  ${row.zid} ${row.label}: ${row.error}`);
}

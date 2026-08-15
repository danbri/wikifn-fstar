// The compiled path must agree with the interpreted one.
//
// There are now two ways to run a Wikifunction here. The interpreter carries
// each composition as an `expr` tree and walks it. The compiler turns each
// composition into an F* function of its own, which extracts to an OCaml
// function and then a JavaScript function, so calling it is a function call.
//
// Two implementations of the same thing is a liability unless something forces
// them to agree. This is that something. Both are generated from the same tree
// by the same pass, so a disagreement means the compiler mistranslated - it
// cannot mean the corpus changed under one of them.
//
// The arguments are not invented: they come from each function's own
// Wikifunctions testers, via docs/generated/examples.json.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const engine = path.resolve("docs/generated/wikifn_engine.cjs");
const catalogue = path.resolve("docs/generated/functions.json");
const examplesPath = path.resolve("docs/generated/examples.json");

const skip = !existsSync(engine) || !existsSync(catalogue)
  ? { skip: "no built engine; run make fstar-engine" }
  : {};

function loaded() {
  require(engine);
  return {
    catalogue: require(catalogue),
    examples: existsSync(examplesPath) ? require(examplesPath).examples : {}
  };
}

// Both entry points answer in the same envelope, so one comparison serves.
const outcome = (json) => {
  const response = JSON.parse(json);
  return response.ok
    ? { ok: true, result: response.result }
    : { ok: false, message: response.message };
};

test("the compiled path exists and is reachable by ZID", skip, () => {
  loaded();
  assert.equal(
    typeof globalThis.wikifnCompiledCall, "function",
    "the artifact does not export wikifnCompiledCall"
  );
});

test("a compiled function is a function, not an interpreted tree", skip, () => {
  loaded();
  const response = JSON.parse(
    globalThis.wikifnCompiledCall("Z10012", JSON.stringify(["stressed"])));
  assert.ok(response.ok, `Z10012 compiled: ${response.message}`);
  assert.equal(response.compiled, true, "the answer did not come from the compiled path");
  assert.equal(response.result.text, "desserts");
});

// No compiled function may take an unreasonable amount of time.
//
// This is not a performance test. A compiled recursive function used to be
// handed a fresh full fuel budget by every caller, so a function that walked a
// string and called a recursive helper per character had that budget for each
// of them - and `Z11053` did not return in five minutes. Nothing caught it,
// because the sweep that would have caught it was running in this process and
// hung on the same call.
//
// So the sweep runs in a child process with a deadline, and the child writes
// which call it is on before making it. If the deadline passes, the last line
// of that file names the function that did not come back.
test("no compiled function takes an unreasonable time to answer", {
  ...skip,
  timeout: 600_000
}, () => {
  const progress = path.join(os.tmpdir(), `wikifn-compiled-sweep-${process.pid}.log`);
  const result = spawnSync(process.execPath, [
    path.resolve("scripts/compiled-sweep.js"), "--json", "--slow-ms", "2000",
    "--progress", progress
  ], { encoding: "utf8", timeout: 300_000, maxBuffer: 32 * 1024 * 1024 });

  if (result.error?.code === "ETIMEDOUT" || result.signal) {
    let last = "(no progress written)";
    try {
      const lines = readFileSync(progress, "utf8").trim().split("\n");
      last = lines[lines.length - 1];
    } catch { /* the message below still says what happened */ }
    assert.fail(
      "the compiled sweep did not finish. The call it was on when it stopped:\n" +
      `      ${last}\n` +
      "  A compiled function that does not return is almost always fuel: a\n" +
      "  recursive callee handed a fresh budget instead of the caller's."
    );
  }
  assert.equal(result.status, 0, `the sweep failed: ${result.stderr}`);
  const report = JSON.parse(result.stdout);
  // A throw is a crash, not a limit. Fuel bounds the recursion depth and a
  // level is a stack frame, so a budget larger than the stack turns "fuel
  // exhausted", which a caller can read, into a stack overflow, which takes
  // the caller down with it.
  assert.deepEqual(
    report.threw.map((row) => `${row.zid} ${row.label}: ${row.error}`), [],
    `${report.threwCount} compiled calls threw instead of returning a result`
  );
  assert.deepEqual(
    report.slow.map((row) => `${row.zid} ${row.label}: ${row.ms} ms`), [],
    `${report.slowCount} compiled calls took ${report.slowMs} ms or more, out of ` +
    `${report.calls} in ${report.totalMs} ms total`
  );
});

test("compiled and interpreted agree on every tester example", skip, () => {
  const { catalogue: cat, examples } = loaded();
  const disagreements = [];
  const interpreterOnly = [];
  let compared = 0;
  let compiledMissing = 0;

  for (const entry of cat.functions) {
    if (!entry.compiled) continue;
    // Two examples each is enough to catch a mistranslation, and the whole
    // sweep has to finish: a compiled recursive function entered from outside
    // starts with a full fuel budget.
    for (const sample of (examples[entry.zid] ?? []).slice(0, 2)) {
      const payload = JSON.stringify(sample.args);
      let compiled;
      try {
        compiled = outcome(globalThis.wikifnCompiledCall(entry.zid, payload));
      } catch (error) {
        compiled = { ok: false, message: `threw: ${error.message}` };
      }
      // A function with no compiled form is a gap, counted below, not a
      // disagreement: nothing was computed twice.
      if (!compiled.ok && /has no compiled function/.test(compiled.message ?? "")) {
        compiledMissing += 1;
        continue;
      }

      let interpreted;
      try {
        interpreted = outcome(
          globalThis.wikifnEngineCall(entry.zid, "20000", payload));
      } catch (error) {
        interpreted = { ok: false, message: `threw: ${error.message}` };
      }

      compared += 1;
      // Both failing is agreement: the same input is refused either way. The
      // messages can differ, because fuel is spent differently.
      if (!compiled.ok && !interpreted.ok) continue;
      // Which side is wrong matters. The compiled path answering where the
      // interpreter cannot is not a mistranslation - it is the interpreter's
      // own limit showing, and it has two: a host stack that gives out before
      // its depth limit does, and Z811 on a shape it refuses. Those are worth
      // knowing about and are listed, but they are not this test's subject.
      if (compiled.ok && !interpreted.ok) {
        interpreterOnly.push(
          `${entry.zid} ${entry.label} ${payload}: ${interpreted.message}`);
        continue;
      }
      if (JSON.stringify(compiled.result) !== JSON.stringify(interpreted.result)) {
        if (disagreements.length < 8) {
          disagreements.push(
            `${entry.zid} ${entry.label} ${payload}\n` +
            `      compiled:    ${JSON.stringify(compiled)}\n` +
            `      interpreted: ${JSON.stringify(interpreted)}`
          );
        }
      }
    }
  }

  assert.ok(compared > 100, `only ${compared} calls compared; expected the sweep to be broad`);
  if (interpreterOnly.length) {
    // Not a failure: the compiled path answered and the interpreter could not.
    // Printed so the count cannot drift unnoticed.
    console.log(
      `  note: ${interpreterOnly.length} calls the interpreter could not answer ` +
      `and the compiled path could:\n    ${interpreterOnly.slice(0, 5).join("\n    ")}`);
  }
  assert.deepEqual(
    disagreements, [],
    `${disagreements.length} disagreements over ${compared} compared calls ` +
    `(${compiledMissing} had no compiled form)`
  );
});

// Not every runnable function can be compiled, and the number that cannot is a
// budget rather than a bug.
//
// What is left is not about termination. A compiled function threads a step
// budget now, so anything that branches stops and reports exhaustion exactly as
// the interpreter does. The three that remain all want the same missing thing:
// a dispatcher reachable from inside a compiled function, so that applying a
// function value - Z13318 and its siblings, and a computed function passed to
// map, filter, fold or zip - can be compiled at all. Unquoting needs an
// evaluator, which compiled code does not have.
//
// Lower this as the compiled path grows; raising it needs a reason.
const NOT_COMPILED_BUDGET = 300;

test("what cannot be compiled stays a stated number", skip, () => {
  const { catalogue: cat } = loaded();
  // Read from the catalogue rather than discovered by calling. The obvious
  // version of this test - call each one and see whether the dispatcher knows
  // it - runs a thousand functions with a full fuel budget and never finishes;
  // it hung three times before this comment was written.
  const missing = cat.functions
    .filter((entry) => entry.runnable && !entry.compiled)
    .map((entry) => `${entry.zid} ${entry.label}`);

  assert.ok(
    missing.length <= NOT_COMPILED_BUDGET,
    `${missing.length} runnable functions have no compiled form; budget ` +
    `${NOT_COMPILED_BUDGET}.\n  for example: ${missing.slice(0, 5).join(", ")}`
  );
});

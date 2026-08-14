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
import { existsSync } from "node:fs";
import path from "node:path";

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

test("compiled and interpreted agree on every tester example", skip, () => {
  const { catalogue: cat, examples } = loaded();
  const disagreements = [];
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
  assert.deepEqual(
    disagreements, [],
    `${disagreements.length} disagreements over ${compared} compared calls ` +
    `(${compiledMissing} had no compiled form)`
  );
});

test("every runnable function has a compiled form", skip, () => {
  const { catalogue: cat } = loaded();
  // Read from the catalogue rather than discovered by calling. The obvious
  // version of this test - call each one and see whether the dispatcher knows
  // it - runs a thousand functions with a full fuel budget and never finishes;
  // it hung three times before this comment was written.
  const missing = cat.functions
    .filter((entry) => entry.runnable && !entry.compiled)
    .map((entry) => `${entry.zid} ${entry.label}`);

  assert.deepEqual(
    missing.slice(0, 10), [],
    `${missing.length} runnable functions have no compiled form`
  );
});

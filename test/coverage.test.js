// What the translator and the compiler still cannot do, as tests.
//
// Every refusal in this repo is recorded with a reason, which is good, and for
// a long time that was where it stopped: the reasons were counted, printed once
// at the end of a generation run, and never looked at again. A count in a log
// is not a commitment. These are.
//
// Each class below is a named shortfall with a budget. A budget of zero means
// the class is gone and must not come back. A budget above zero is a debt: it
// is written down, it is attributed to either this repo or the corpus, and it
// may only ever be lowered.
//
// The rule for which is which: if a form is expressible in Wikifunctions and we
// refuse it, that is ours and its budget must reach zero. If the pinned object
// is itself unreadable - a function whose argument declaration does not parse -
// that is the corpus, and no amount of work here fixes it.
//
//   node scripts/generate-fstar-eval.js --report build/generation-report.json
//   node --test test/coverage.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const reportPath = path.resolve("build/generation-report.json");
const skip = !existsSync(reportPath)
  ? { skip: "no build/generation-report.json; run make fstar-generate-eval" }
  : {};

const report = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : { skippedByReason: [], skippedFunctions: [] };

const countFor = (pattern) => (report.skippedByReason ?? [])
  .filter((row) => pattern.test(row.reason))
  .reduce((total, row) => total + row.count, 0);

// Ours. Every one of these is a form the corpus writes and we decline to
// translate, so every budget here has to reach zero.
const OURS = [
  {
    name: "a typed object whose type is a generic application",
    pattern: /^object of type/,
    budget: 0,
    why: "A record's type can be a Z7 application such as Z881(Z6). Reading only "
       + "a plain ZID there refuses the object outright."
  },
  {
    name: "applying a function that is computed rather than named",
    pattern: /computed function reference/,
    budget: 0,
    why: "Z7K1 can be an expression yielding a function. This is ordinary "
       + "higher-order code in Wikifunctions, not an edge case."
  },
  {
    name: "a natural number literal that is not written in decimal",
    pattern: /non-decimal natural literal/,
    budget: 0,
    why: "A Z13518 whose value is not plain digits is still a natural number."
  },
  {
    name: "a body too large for F* to check",
    pattern: /over the \d+ F\* can check/,
    budget: 0,
    why: "Z24460 carries the whole Unicode Extended_Pictographic table inline as "
       + "a list of forty thousand numbers. The list is the wrong representation "
       + "for text that size, not the wrong size for a list."
  }
];

// The corpus. These are defects in the pinned objects; translating them is not
// possible and pretending otherwise would mean inventing content.
const CORPUS = [
  { name: "a function whose argument declaration does not parse", pattern: /unreadable argument declaration/ },
  { name: "a function whose argument order cannot be read", pattern: /unknown argument order/ },
  { name: "a call missing a declared argument", pattern: /call is missing/ }
];

test("the generation report exists and records every refusal with a reason", skip, () => {
  assert.ok(Array.isArray(report.skippedByReason), "no skippedByReason in the report");
  const counted = report.skippedByReason.reduce((total, row) => total + row.count, 0);
  assert.equal(
    counted, report.skipped,
    "some functions were skipped without a recorded reason"
  );
});

for (const shortfall of OURS) {
  test(`ours: ${shortfall.name}`, skip, () => {
    const count = countFor(shortfall.pattern);
    const examples = (report.skippedFunctions ?? [])
      .filter((entry) => shortfall.pattern.test(entry.reason))
      .slice(0, 5)
      .map((entry) => `${entry.zid} (${entry.reason})`);
    assert.ok(
      count <= shortfall.budget,
      `${count} functions refused, budget ${shortfall.budget}.\n` +
      `  ${shortfall.why}\n` +
      (examples.length ? `  for example: ${examples.join(", ")}` : "")
    );
  });
}

test("the corpus's own defects are separated from ours, and named", skip, () => {
  // Not a budget: these cannot be fixed here. The test exists so that a defect
  // in a pinned object is never quietly reclassified as something we could have
  // translated and did not.
  const named = CORPUS.map((row) => `${row.name}: ${countFor(row.pattern)}`);
  const accountedFor = [...OURS, ...CORPUS]
    .reduce((total, row) => total + countFor(row.pattern), 0);
  assert.equal(
    accountedFor, report.skipped,
    `${report.skipped - accountedFor} refusals belong to no named class.\n` +
    `  Known corpus defects: ${named.join("; ")}\n` +
    "  A refusal with no class is a shortfall nobody has looked at."
  );
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { checkTesters } from "../scripts/check-testers.js";

const artifact = path.resolve("docs/generated/wikifn_call_browser.js");
const cache = path.resolve("cache/wikifunctions/objects");
const ready = existsSync(artifact) && existsSync(cache);

// The extracted evaluator works on codepoint lists and is slow on long inputs,
// so the default run covers the short testers. WIKIFN_TESTER_MAX_INPUT=0
// removes the limit.
const maxInput = Number(process.env.WIKIFN_TESTER_MAX_INPUT ?? 64);

const FUNCTIONS = [
  "Z10052", "Z10627", "Z11082", "Z19612", "Z21679",
  "Z22294", "Z22649", "Z27053", "Z38114"
];

test(
  "extracted F* agrees with Wikifunctions testers via the Z7 adapter",
  { skip: ready ? false : "build docs/generated/wikifn_call_browser.js and populate the cache first" },
  async () => {
    const report = await checkTesters(FUNCTIONS, { modes: ["zobject"], maxInput });

    assert.equal(report.counts.error, 0, `evaluation errors: ${describe(report, "error")}`);
    assert.equal(report.counts.fail, 0, `tester disagreements: ${describe(report, "fail")}`);
    assert.ok(report.counts.pass > 0, "no testers ran");
  }
);

test(
  "generated, compiled, and specialized F* paths agree with each other",
  { skip: ready ? false : "build docs/generated/wikifn_call_browser.js and populate the cache first" },
  async () => {
    const report = await checkTesters(FUNCTIONS, {
      modes: ["generated", "compiled", "specialized"],
      maxInput
    });

    const byTester = new Map();
    for (const entry of report.cases) {
      if (entry.status !== "pass" && entry.status !== "fail") continue;
      const key = `${entry.function_zid}/${entry.tester_zid}`;
      if (!byTester.has(key)) byTester.set(key, new Map());
      byTester.get(key).set(entry.mode, entry.actual);
    }

    for (const [key, results] of byTester) {
      const values = [...new Set(results.values())];
      assert.equal(values.length, 1, `${key} disagrees across paths: ${JSON.stringify([...results])}`);
    }

    assert.equal(report.counts.fail, 0, `tester disagreements: ${describe(report, "fail")}`);
  }
);

function describe(report, status) {
  return report.cases
    .filter((entry) => entry.status === status)
    .map((entry) =>
      `${entry.function_zid}/${entry.tester_zid}${entry.mode ? `[${entry.mode}]` : ""}: ` +
      (entry.reason ?? `expected ${JSON.stringify(entry.expected)}, got ${JSON.stringify(entry.actual)}`))
    .join("; ");
}

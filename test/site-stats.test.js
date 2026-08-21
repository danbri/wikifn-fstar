// The homepage must say what the build measures.
//
// docs/index.html is the one artifact that ships to a reader, and for eight
// commits it was the only one nothing checked. It claimed 2,430 compositions
// and 211 functions passing every tester; the build had 3,893 and 800, and
// docs/tester-report.html - generated, linked from that same page - said so.
// A visitor could read both and get two different projects.
//
// Every number on that page is generated now, and this is what keeps it that
// way: regenerate the marked regions from the committed artifacts and require
// the file on disk to already match. Editing a count by hand fails here.
//
// This reads only committed JSON, so it runs on a clean checkout with no dump,
// no SQLite index and no F*. That is the point - a check that needs the whole
// toolchain is a check that does not run.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { indexPath, measurements, renderSiteStats } from "../scripts/render-site-stats.js";

test("the homepage numbers are the ones the build measured", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.equal(
    renderSiteStats(html), html,
    "docs/index.html does not match the generated artifacts.\n" +
    "  Run: make site-stats\n" +
    "  A number on that page was typed rather than measured, or an artifact was\n" +
    "  regenerated without regenerating the page that quotes it."
  );
});

// A number that is missing is a number that silently stops being checked, and
// the substitution above would keep passing on a page that no longer says it.
test("every number the page quotes is present and non-zero", () => {
  const stats = measurements();
  const missing = Object.entries(stats)
    .filter(([, value]) => !Number.isInteger(value) || value <= 0)
    .map(([name, value]) => `${name}: ${value}`);
  assert.deepEqual(missing, [], "a measurement is missing or not a positive count");
});

// The counts have to be consistent with each other, because an artifact can be
// regenerated on its own and the page would still render.
test("the measurements agree with each other", () => {
  const stats = measurements();
  assert.equal(
    stats.closedWithoutRecursion + stats.closedNeedingRecursion, stats.closedTotal,
    "the closure summary's parts do not sum to its total"
  );
  assert.ok(
    stats.translated <= stats.corpusFunctions,
    `more compositions translated (${stats.translated}) than functions in the corpus ` +
    `(${stats.corpusFunctions}); the artifacts are from different runs`
  );
  assert.equal(
    stats.renderedBack, stats.translated,
    "the page says every translated composition was rendered back, and the two " +
    "artifacts disagree about how many that is"
  );
  for (const [smaller, larger] of [["compiled", "translated"], ["runnable", "translated"],
                                   ["fullyPassing", "atLeastOnePass"],
                                   ["atLeastOnePass", "translated"]]) {
    assert.ok(
      stats[smaller] <= stats[larger],
      `${smaller} (${stats[smaller]}) cannot exceed ${larger} (${stats[larger]})`
    );
  }
});

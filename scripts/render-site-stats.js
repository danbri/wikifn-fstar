#!/usr/bin/env node
// Put the homepage's numbers back under the generator that measures them.
//
// docs/index.html was written by hand, and every count in it was typed in.
// Typed-in counts go stale silently: the site said 2,430 compositions and 211
// functions passing every tester while the build had 3,893 and 800, and
// docs/tester-report.html - generated, linked from the same page - said the
// larger numbers. The site contradicted itself for eight commits and no test
// could have noticed, because nothing read those numbers.
//
// So they are generated now, from the same committed artifacts the rest of the
// site quotes:
//
//   docs/generated/closure-summary.json   corpus size and closure counts
//   docs/generated/functions.json         what was translated, and what runs
//   docs/generated/tester-report.json     what passes Wikifunctions' own testers
//   docs/generated/wikifn-compositions.json  what was rendered back
//
// All four are committed, so this works from a clean checkout - it needs no
// SQLite index, no dump, and no F*. That matters: test/site-stats.test.js runs
// this and fails if docs/index.html disagrees, and that test has to be able to
// run anywhere, which is what makes the staleness impossible to reintroduce
// rather than merely fixed once.
//
//   node scripts/render-site-stats.js            rewrite docs/index.html
//   node scripts/render-site-stats.js --check    report drift, change nothing
//
// Every region is delimited in the HTML by a pair of comments. Text outside
// them stays hand-written, because prose is not a number.

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "docs", "generated");
export const indexPath = path.join(root, "docs", "index.html");

const read = (name) => JSON.parse(readFileSync(path.join(generated, name), "utf8"));

const count = (n) => n.toLocaleString("en-US");

// What each number is, and where it is read from. Kept as data so a row can
// only exist if something measured it.
export function measurements() {
  const closure = read("closure-summary.json");
  const catalogue = read("functions.json");
  const testers = read("tester-report.json");
  const compositions = read("wikifn-compositions.json");

  const functions = catalogue.functions;
  return {
    corpusFunctions: closure.corpus.functions,
    closedTotal: closure.counts.closedTotal,
    closedWithoutRecursion: closure.counts.closedWithoutRecursion,
    closedNeedingRecursion: closure.counts.closedNeedingRecursion,
    translated: functions.length,
    // Every callee present and no path into a cycle with no base case, so the
    // call returns rather than hanging. Computed in generate-fstar-eval.js.
    runnable: functions.filter((entry) => entry.runnable).length,
    // A composition that is also its own F* function rather than a tree for
    // the interpreter to walk.
    compiled: functions.filter((entry) => entry.compiled).length,
    fullyPassing: testers.totals.functionsFullyPassing,
    atLeastOnePass: testers.totals.functionsWithAtLeastOnePass,
    renderedBack: Object.keys(compositions.compositions).length
  };
}

// Prose is wrapped rather than written line by line, because a number that
// grows a digit would otherwise push one line long and leave the next short,
// and the diff would be about the wrapping instead of about the number.
function wrap(text, pad, width = 78) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${pad}${line} ${word}`.length > width) {
      lines.push(`${pad}${line}`);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(`${pad}${line}`);
  return lines;
}

// The regions, by marker name. Each returns the lines that go between the
// markers, already indented to sit where they sit.
const REGIONS = {
  "stats-lede": (m, pad) => [
    `${pad}<p>`,
    ...wrap(
      `${count(m.translated)} real Wikifunctions compositions, mechanically ` +
      "translated into F*, checked by F*, extracted to OCaml, compiled to " +
      `JavaScript, and runnable in a browser. ${count(m.fullyPassing)} of them ` +
      "pass every Wikifunctions tester this project can read.",
      `${pad}  `
    ),
    `${pad}</p>`
  ],

  "stats-table": (m, pad) => {
    const row = (head, value) => `${pad}<tr><th>${head}</th><td>${value}</td></tr>`;
    return [
      row("Functions in the corpus", count(m.corpusFunctions)),
      row(
        "Closing over the current primitives",
        `${count(m.closedTotal)} (${count(m.closedWithoutRecursion)} without recursion, ` +
        `${count(m.closedNeedingRecursion)} with)`
      ),
      row("Translated into F* and verified", `<strong>${count(m.translated)}</strong>`),
      row("Compiled into F* functions of their own", count(m.compiled)),
      row("Runnable today", count(m.runnable)),
      row(
        "Passing every readable Wikifunctions tester",
        `<strong>${count(m.fullyPassing)}</strong>`
      ),
      row("Passing at least one tester", count(m.atLeastOnePass)),
      row(
        "Rendered back to canonical Wikifunctions compositions",
        `all ${count(m.renderedBack)}, identical on round trip`
      )
    ];
  }
};

// A region is found by its markers rather than by line number, so editing the
// prose around it cannot break the substitution.
function replaceRegion(html, name, lines) {
  const open = new RegExp(`^([ \\t]*)<!-- generated:${name} -->$`, "m");
  const found = open.exec(html);
  if (!found) throw new Error(`docs/index.html has no <!-- generated:${name} --> marker`);
  const close = `${found[1]}<!-- /generated:${name} -->`;
  const from = found.index + found[0].length;
  const to = html.indexOf(`\n${close}`, from);
  if (to < 0) throw new Error(`docs/index.html has no <!-- /generated:${name} --> marker`);
  return `${html.slice(0, from)}\n${lines.join("\n")}${html.slice(to)}`;
}

export function renderSiteStats(html, stats = measurements()) {
  let out = html;
  for (const [name, build] of Object.entries(REGIONS)) {
    const pad = new RegExp(`^([ \\t]*)<!-- generated:${name} -->$`, "m").exec(out)?.[1] ?? "";
    out = replaceRegion(out, name, build(stats, pad));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = await readFile(indexPath, "utf8");
  const next = renderSiteStats(html);
  if (process.argv.includes("--check")) {
    if (next === html) {
      console.log("docs/index.html is current");
    } else {
      console.error("docs/index.html does not match the generated artifacts; run make site-stats");
      process.exit(1);
    }
  } else if (next === html) {
    console.log("docs/index.html is current");
  } else {
    await writeFile(indexPath, next, "utf8");
    console.log("docs/index.html updated");
  }
}

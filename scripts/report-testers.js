#!/usr/bin/env node
// Turn a tester sweep into a report that names root causes, not symptoms.
//
// scripts/check-engine-testers.js already runs every readable Wikifunctions
// tester against the extracted JavaScript engine. What it produces is a list of
// outcomes, and a list of outcomes is not an answer: "nesting depth limit
// reached" appears hundreds of times and says nothing about which function is
// actually at fault. Almost always it is not the function under test - it is
// something several calls below it, sitting in a group of compositions defined
// through each other with no base case.
//
// So this walks the call graph, finds those groups, and attributes each failure
// to the one it reaches. That turns hundreds of identical messages into a
// couple of dozen root causes, each with a name and a count.
//
//   node scripts/report-testers.js                 # run the sweep, then report
//   node scripts/report-testers.js --in sweep.json # report on an existing sweep
//
// Writes docs/generated/tester-report.json and docs/tester-report.html.

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const catalogue = require(path.join(root, "docs", "generated", "functions.json"));
require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));

const byZid = new Map(catalogue.functions.map((entry) => [entry.zid, entry]));
const names = JSON.stringify(catalogue.names ?? {});
const labelOf = (zid) => byZid.get(zid)?.label || catalogue.names?.[zid] || zid;

const sourceCache = new Map();
function sourceOf(zid) {
  if (sourceCache.has(zid)) return sourceCache.get(zid);
  const entry = byZid.get(zid);
  let text = null;
  if (entry) {
    try {
      const rendered = JSON.parse(
        globalThis.wikifnEngineSource(zid, String(entry.arity), names));
      if (rendered.ok) text = rendered.source;
    } catch { /* too deep for the printer; treated as unknown */ }
  }
  sourceCache.set(zid, text);
  return text;
}

// Callees a body actually names. Read back off the printed source rather than
// the catalogue, so it reflects the body that runs.
const calleeCache = new Map();
function calleesOf(zid) {
  if (calleeCache.has(zid)) return calleeCache.get(zid);
  const source = sourceOf(zid) ?? "";
  const callees = [...new Set([...source.matchAll(/\b(Z\d+)_/g)].map((m) => m[1]))]
    .filter((callee) => byZid.has(callee) && callee !== zid);
  calleeCache.set(zid, callees);
  return callees;
}

// Tarjan, iterative: the graph is a few thousand nodes and recursion here would
// be one more stack overflow in a project that has already had two.
function stronglyConnected(nodes, successors) {
  const index = new Map(), low = new Map(), onStack = new Set();
  const stack = [], groups = [];
  let counter = 0;
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, childIndex] = frame;
      if (childIndex === 0) {
        index.set(node, counter); low.set(node, counter); counter += 1;
        stack.push(node); onStack.add(node);
      }
      const children = successors(node);
      if (childIndex < children.length) {
        frame[1] += 1;
        const child = children[childIndex];
        if (!index.has(child)) work.push([child, 0]);
        else if (onStack.has(child)) low.set(node, Math.min(low.get(node), index.get(child)));
      } else {
        if (low.get(node) === index.get(node)) {
          const group = [];
          let popped;
          do { popped = stack.pop(); onStack.delete(popped); group.push(popped); }
          while (popped !== node);
          if (group.length > 1) groups.push(group);
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          low.set(parent, Math.min(low.get(parent), low.get(node)));
        }
      }
    }
  }
  return groups;
}

// Which unproductive group, if any, a function can reach. Bounded, because the
// point is to name a cause rather than to explore the whole graph.
function reachesGroup(zid, memberOf) {
  const seen = new Set([zid]);
  const queue = [zid];
  while (queue.length) {
    const node = queue.shift();
    if (memberOf.has(node)) return memberOf.get(node);
    for (const callee of calleesOf(node)) {
      if (!seen.has(callee)) { seen.add(callee); queue.push(callee); }
    }
  }
  return undefined;
}

const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  let sweep;
  const given = valueOf("--in");
  if (given) {
    sweep = JSON.parse(await readFile(given, "utf8"));
  } else {
    console.error("running the tester sweep against the extracted engine…");
    const out = path.join(root, "build", "tester-sweep.json");
    await execFileAsync(
      process.execPath,
      [path.join(root, "scripts", "check-engine-testers.js"), "--json", "--out", out],
      { maxBuffer: 1024 * 1024 * 1024 }
    );
    sweep = JSON.parse(await readFile(out, "utf8"));
  }

  const groups = stronglyConnected([...byZid.keys()], calleesOf);
  const memberOf = new Map();
  groups.forEach((group, index) => {
    const sorted = [...group].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    for (const zid of group) memberOf.set(zid, index);
    groups[index] = sorted;
  });

  // One row per function, so the report is about functions rather than about
  // the several thousand tester cases.
  const perFunction = new Map();
  for (const entry of sweep.cases) {
    const row = perFunction.get(entry.function_zid) ?? {
      zid: entry.function_zid,
      label: labelOf(entry.function_zid),
      pass: 0, fail: 0, error: 0, skipped: 0,
      reasons: new Map(),
      disagreements: []
    };
    row[entry.status] = (row[entry.status] ?? 0) + 1;
    if (entry.status === "error" || entry.status === "skipped") {
      row.reasons.set(entry.reason, (row.reasons.get(entry.reason) ?? 0) + 1);
    }
    if (entry.status === "fail" && row.disagreements.length < 3) {
      row.disagreements.push({
        input: entry.input, expected: entry.expected, actual: entry.actual
      });
    }
    perFunction.set(entry.function_zid, row);
  }

  // Attribute every failing function to one cause.
  const causes = new Map();
  const addTo = (key, title, kind, row) => {
    const cause = causes.get(key) ?? { key, title, kind, functions: [], cases: 0, members: [] };
    cause.functions.push(row);
    cause.cases += row.error + row.fail;
    causes.set(key, cause);
    return cause;
  };

  const failing = [];
  for (const row of perFunction.values()) {
    if (row.error === 0 && row.fail === 0) continue;
    const topReason = [...row.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    row.topReason = topReason || (row.fail ? "disagrees with its tester" : "");
    failing.push(row);

    if (/nesting depth/.test(topReason)) {
      const group = reachesGroup(row.zid, memberOf);
      if (group !== undefined) {
        const members = groups[group];
        const cause = addTo(
          `cycle:${group}`,
          members.map((z) => `${z} ${labelOf(z)}`).join("  ↔  "),
          "cycle",
          row
        );
        cause.members = members;
        continue;
      }
      addTo("cycle:unknown", "reaches a depth limit with no group identified", "cycle", row);
      continue;
    }
    const missing = /no implementation for (Z\d+)/.exec(topReason);
    if (missing) {
      addTo(`missing:${missing[1]}`, `${missing[1]} ${labelOf(missing[1])} is not implemented`,
        "missing", row);
      continue;
    }
    if (/fuel exhausted/.test(topReason)) { addTo("fuel", "runs out of fuel", "fuel", row); continue; }
    if (row.fail) { addTo("disagree", "runs, and disagrees with its tester", "disagree", row); continue; }
    addTo(`other:${topReason}`, topReason || "other", "other", row);
  }

  const ranked = [...causes.values()].sort((a, b) => b.functions.length - a.functions.length);
  const fullyPassing = [...perFunction.values()].filter((r) => r.pass > 0 && r.fail === 0 && r.error === 0);

  const report = {
    generated: "scripts/report-testers.js",
    engine: "docs/generated/wikifn_engine.cjs, extracted from F* via OCaml and js_of_ocaml",
    totals: sweep.report,
    functionsWithTesters: perFunction.size,
    functionsFullyPassing: fullyPassing.length,
    functionsFailing: failing.length,
    unproductiveGroups: groups.length,
    functionsInsideAGroup: [...memberOf.keys()].length,
    causes: ranked.map((cause) => ({
      kind: cause.kind,
      title: cause.title,
      members: cause.members,
      functions: cause.functions.length,
      cases: cause.cases,
      examples: cause.functions
        .sort((a, b) => (b.error + b.fail) - (a.error + a.fail))
        .slice(0, 40)
        .map((row) => ({
          zid: row.zid, label: row.label,
          pass: row.pass, fail: row.fail, error: row.error,
          disagreements: row.disagreements
        }))
    }))
  };

  const jsonPath = path.join(root, "docs", "generated", "tester-report.json");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  // The page. Static, because the data is static until the next sweep.
  const t = sweep.report;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>What still fails</title>
    <link rel="stylesheet" href="./styles.css">
    <style>
      .totals { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 1rem 0 2rem; }
      .totals div { min-width: 7rem; }
      .totals .n { font-size: 1.6rem; font-weight: 600; display: block; }
      .totals .k { font-size: 0.85em; opacity: 0.75; }
      .cause { border: 1px solid rgba(128,128,128,0.3); border-radius: 0.4rem;
        padding: 0.8rem 1rem; margin-bottom: 0.8rem; }
      .cause > summary { cursor: pointer; font-weight: 600; }
      .cause .meta { font-size: 0.85em; opacity: 0.75; font-weight: 400; }
      .cause table { width: 100%; border-collapse: collapse; margin-top: 0.7rem; font-size: 0.9em; }
      .cause td, .cause th { text-align: left; padding: 0.2rem 0.6rem 0.2rem 0; vertical-align: top; }
      .zid { font-family: ui-monospace, monospace; font-size: 0.9em; }
      .diff { font-family: ui-monospace, monospace; font-size: 0.85em; opacity: 0.85; }
      .kind-cycle { border-left: 3px solid #c9772f; }
      .kind-missing { border-left: 3px solid #4a7fb5; }
      .kind-disagree { border-left: 3px solid #a34a5e; }
      .kind-fuel, .kind-other { border-left: 3px solid #777; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p class="eyebrow">wikifn-fstar</p>
        <h1>What still fails</h1>
        <p>
          Every Wikifunctions tester whose call and expected value this harness
          can read, run against the extracted JavaScript engine &mdash; the same
          artifact the <a href="./demo-engine.html">engine browser</a> loads.
          Generated by <code>make tester-report</code>; nothing here is written
          by hand.
        </p>
        <p>
          Failures are grouped by <strong>cause</strong> rather than by message.
          Hundreds of functions report a depth limit, but almost none of them are
          themselves at fault: they call something that calls something that sits
          in a group of compositions defined through each other with no base
          case. Each such group is named once below, with everything it strands.
        </p>
      </header>

      <div class="totals">
        <div><span class="n">${t.counts.pass.toLocaleString()}</span><span class="k">testers pass</span></div>
        <div><span class="n">${t.counts.fail.toLocaleString()}</span><span class="k">disagree</span></div>
        <div><span class="n">${t.counts.error.toLocaleString()}</span><span class="k">error</span></div>
        <div><span class="n">${t.counts.skipped.toLocaleString()}</span><span class="k">skipped</span></div>
        <div><span class="n">${report.functionsFullyPassing.toLocaleString()}</span><span class="k">functions pass every tester read</span></div>
        <div><span class="n">${report.functionsFailing.toLocaleString()}</span><span class="k">functions with a failure</span></div>
      </div>

      <section>
        <h2>Causes, most functions first</h2>
        <p class="count">
          ${report.unproductiveGroups} groups of mutually recursive compositions remain,
          holding ${report.functionsInsideAGroup} functions between them.
        </p>
${ranked.map((cause) => `        <details class="cause kind-${cause.kind}">
          <summary>${escapeHtml(cause.title)}
            <span class="meta"> &middot; ${cause.functions.length} function${cause.functions.length === 1 ? "" : "s"}, ${cause.cases} tester case${cause.cases === 1 ? "" : "s"}</span>
          </summary>
          <table>
            <tr><th>function</th><th>pass</th><th>fail</th><th>error</th><th></th></tr>
${cause.functions.slice(0, 40).map((row) => `            <tr><td><span class="zid">${row.zid}</span> ${escapeHtml(row.label)}</td><td>${row.pass}</td><td>${row.fail}</td><td>${row.error}</td><td class="diff">${row.disagreements.map((d) => `${escapeHtml(JSON.stringify(d.input))} &rarr; ${escapeHtml(JSON.stringify(d.actual?.text ?? d.actual?.value ?? d.actual))}, wanted ${escapeHtml(JSON.stringify(d.expected))}`).join("<br>")}</td></tr>`).join("\n")}
          </table>
${cause.functions.length > 40 ? `          <p class="count">and ${cause.functions.length - 40} more.</p>` : ""}
        </details>`).join("\n")}
      </section>

      <section>
        <h2>What is not counted</h2>
        <ul>
          <li>
            A tester counts as passing only when both its call and its expected
            value were readable. ${t.counts.skipped.toLocaleString()} were not, and are
            skipped with a stated reason rather than counted either way.
          </li>
          <li>
            A disagreement is not always this engine's fault. Some compositions
            in the corpus are simply wrong, and their own testers say so.
          </li>
          <li>
            The full data, including every skipped reason, is in
            <a href="./generated/tester-report.json">tester-report.json</a>.
          </li>
        </ul>
        <p><a href="./demos.html">Demos menu</a> &middot; <a href="./engine.md">How it works</a></p>
      </section>
    </main>
  </body>
</html>
`;
  const htmlPath = path.join(root, "docs", "tester-report.html");
  await writeFile(htmlPath, html, "utf8");

  console.log(`${report.functionsFailing} functions have a failure, in ${ranked.length} causes`);
  for (const cause of ranked.slice(0, 12)) {
    console.log(`  ${String(cause.functions.length).padStart(4)} functions  ${cause.title.slice(0, 96)}`);
  }
  console.log(jsonPath);
  console.log(htmlPath);
}

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

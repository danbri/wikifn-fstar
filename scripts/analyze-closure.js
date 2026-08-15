#!/usr/bin/env node
// Transitive composition-closure sweep over the whole indexed corpus.
//
// Answers: for how many Wikifunctions functions does some implementation
// bottom out entirely in a chosen set of primitive functions, following
// composition implementations transitively?
//
// Two numbers are reported, because they mean different things:
//
//   closed without recursion  - least fixpoint. Every path terminates in a
//                               primitive with no function depending on itself.
//                               These need no termination argument in F*.
//   closed with recursion     - greatest fixpoint. Same, but a function is
//                               allowed to depend on itself. Each of these
//                               needs a termination measure before F* will
//                               accept it.
//
// Reads the SQLite index built by `wikifn db build`, so it is a fixpoint over
// the call graph rather than a per-seed tree walk.
//
//   node scripts/analyze-closure.js [--set kernel|kernel+list|toy] [--json]
//                                   [--out FILE] [--db PATH]

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authoredDir = path.join(root, "compositions");

// Functions the current F* primitive kernel implements directly: the leaves an
// F* translation may bottom out in today. Mirrors the non-composition
// constructors of function_id in src/fstar/Wikifn.Composition.fst.
export const FSTAR_KERNEL_PRIMITIVES = [
  "Z801", "Z802", "Z866",
  "Z10000", "Z10008", "Z10075", "Z10174", "Z10184", "Z10216", "Z10615", "Z10901",
  "Z11040", "Z13522", "Z13569", "Z13582", "Z13676", "Z13682", "Z13689", "Z13695",
  "Z14124", "Z14456", "Z14520"
];

// The most-called list and record functions not yet in the kernel. Used to size
// the next tier of work; these are not implemented today.
export const LIST_PRIMITIVES = [
  "Z810", "Z811", "Z812", "Z813", "Z873", "Z803",
  "Z21394", "Z12899", "Z12681", "Z12696", "Z18475"
];

// What Wikifn.Eval implements directly today: the string and arithmetic kernel,
// the LISP list core, pair accessors, and the higher-order list functions.
export const ENGINE_PRIMITIVES = [
  "Z801", "Z802", "Z866",
  "Z810", "Z811", "Z812", "Z813", "Z821", "Z822",
  "Z872", "Z873", "Z876",
  "Z10000", "Z10008", "Z10075", "Z10174", "Z10184", "Z10216", "Z10615", "Z10901",
  "Z11040", "Z12681", "Z13522", "Z13569", "Z13582", "Z13676", "Z13682", "Z13689",
  "Z13695", "Z14124", "Z14456", "Z14520",
  "Z13521", "Z13539", "Z13578", "Z13630", "Z13633", "Z13647", "Z13846",
  "Z22693", "Z22717",
  "Z13318", "Z21216", "Z30438", "Z14779",
  "Z803", "Z16829",
  "Z12668", "Z12961",
  "Z13546", "Z868", "Z886",
  "Z13052", "Z29294",
  "Z10047", "Z10018",
  "Z881", "Z882", "Z883", "Z22764",
  "Z99", "Z805", "Z808", "Z899", "Z29267",
  "Z851", "Z850", "Z853"
];

const PRIMITIVE_SETS = {
  toy: ["Z782", "Z783", "Z784", "Z801", "Z802"],
  kernel: FSTAR_KERNEL_PRIMITIVES,
  "kernel+list": [...FSTAR_KERNEL_PRIMITIVES, ...LIST_PRIMITIVES],
  engine: ENGINE_PRIMITIVES
};

async function query(dbPath, sql) {
  const args = [path.join(root, "bin", "wikifn.js"), "db", "query", "--format", "json"];
  if (dbPath) args.push("--db", dbPath);
  args.push(sql);
  const { stdout } = await execFileAsync(process.execPath, args, { maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function loadGraph(dbPath) {
  const [functions, implementations, calls, dynamics, labels] = await Promise.all([
    query(dbPath, "select zid, tester_count from functions"),
    query(dbPath, "select zid, function_zid, body_kind from implementations"),
    query(dbPath, "select distinct from_impl_zid, to_function_zid from composition_calls"),
    query(dbPath, "select distinct from_impl_zid from dynamic_calls"),
    query(dbPath, "select zid, text from english_labels")
  ]);

  const label = new Map(labels.map((row) => [row.zid, row.text]));
  const testerCount = new Map(functions.map((row) => [row.zid, row.tester_count]));
  const dynamicImpls = new Set(dynamics.map((row) => row.from_impl_zid));

  const callsByImpl = new Map();
  for (const row of calls) {
    if (!callsByImpl.has(row.from_impl_zid)) callsByImpl.set(row.from_impl_zid, []);
    callsByImpl.get(row.from_impl_zid).push(row.to_function_zid);
  }

  // Only composition implementations can be translated. An implementation with
  // a call to a computed (non-literal) function reference is unusable.
  const compositionImplsByFunction = new Map();
  for (const row of implementations) {
    if (row.body_kind !== "composition") continue;
    if (!row.function_zid) continue;
    if (dynamicImpls.has(row.zid)) continue;
    if (!compositionImplsByFunction.has(row.function_zid)) compositionImplsByFunction.set(row.function_zid, []);
    compositionImplsByFunction.get(row.function_zid).push(row.zid);
  }

  // Compositions written in compositions/ to fill a gap. They are real
  // implementations as far as this analysis is concerned - the generator
  // translates them and the engine runs them - so leaving them out made the
  // measurement report a frontier that had already moved.
  const authoredCalls = (body, acc) => {
    if (Array.isArray(body)) { for (const item of body) authoredCalls(item, acc); return acc; }
    if (body === null || typeof body !== "object") return acc;
    if (body.Z1K1 === "Z7" && typeof body.Z7K1 === "string") acc.add(body.Z7K1);
    for (const key of Object.keys(body)) authoredCalls(body[key], acc);
    return acc;
  };
  let authoredCount = 0;
  for (const name of (existsSync(authoredDir) ? readdirSync(authoredDir) : [])) {
    if (!name.endsWith(".json")) continue;
    const entry = JSON.parse(readFileSync(path.join(authoredDir, name), "utf8"));
    if (!entry.zid || entry.Z14K2 === undefined) continue;
    const implZid = `${entry.zid}-authored`;
    callsByImpl.set(implZid, [...authoredCalls(entry.Z14K2, new Set())]);
    if (!compositionImplsByFunction.has(entry.zid)) compositionImplsByFunction.set(entry.zid, []);
    compositionImplsByFunction.get(entry.zid).push(implZid);
    authoredCount += 1;
  }

  return {
    functionZids: functions.map((row) => row.zid),
    compositionImplsByFunction,
    callsByImpl,
    dynamicImpls,
    label,
    testerCount,
    counts: {
      functions: functions.length,
      implementations: implementations.length,
      compositionImplementations: implementations.filter((row) => row.body_kind === "composition").length,
      callEdges: calls.length,
      implsWithDynamicCalls: dynamicImpls.size,
      authoredCompositions: authoredCount
    }
  };
}

// Least fixpoint: start from the primitives and grow. A function joins only
// when some implementation's callees are all already in the set, so nothing
// enters on the strength of its own membership. Recursion never closes.
function closedWithoutRecursion(graph, primitives) {
  const closed = new Set(primitives);
  const chosen = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const functionZid of graph.functionZids) {
      if (closed.has(functionZid)) continue;
      for (const implZid of graph.compositionImplsByFunction.get(functionZid) ?? []) {
        const callees = graph.callsByImpl.get(implZid) ?? [];
        if (callees.every((callee) => closed.has(callee))) {
          closed.add(functionZid);
          chosen.set(functionZid, implZid);
          changed = true;
          break;
        }
      }
    }
  }
  return { closed, chosen };
}

// Greatest fixpoint: assume every function closes, then repeatedly drop any
// function with no usable implementation left. What survives may depend on
// itself, so recursion is permitted here.
function closedWithRecursion(graph, primitives) {
  const closed = new Set(graph.functionZids.filter((zid) => graph.compositionImplsByFunction.has(zid)));
  for (const zid of primitives) closed.add(zid);

  let changed = true;
  while (changed) {
    changed = false;
    for (const functionZid of [...closed]) {
      if (primitives.has(functionZid)) continue;
      const impls = graph.compositionImplsByFunction.get(functionZid) ?? [];
      const usable = impls.some((implZid) =>
        (graph.callsByImpl.get(implZid) ?? []).every((callee) => closed.has(callee)));
      if (!usable) {
        closed.delete(functionZid);
        changed = true;
      }
    }
  }
  return closed;
}

// Which missing leaves block the most functions. A leaf is a function that is
// not primitive and has no usable composition implementation, so it must be
// added to the kernel before anything above it can close.
function rankBlockers(graph, primitives, closedRec) {
  const isLeaf = (zid) =>
    !primitives.has(zid) && !(graph.compositionImplsByFunction.get(zid) ?? []).length;

  const memo = new Map();
  const inProgress = new Set();
  const leavesOf = (zid) => {
    if (primitives.has(zid)) return new Set();
    if (memo.has(zid)) return memo.get(zid);
    if (inProgress.has(zid)) return new Set(); // cycle: contributes nothing extra
    if (isLeaf(zid)) return new Set([zid]);
    inProgress.add(zid);
    const result = new Set();
    for (const implZid of graph.compositionImplsByFunction.get(zid) ?? []) {
      for (const callee of graph.callsByImpl.get(implZid) ?? []) {
        for (const leaf of leavesOf(callee)) result.add(leaf);
      }
    }
    inProgress.delete(zid);
    memo.set(zid, result);
    return result;
  };

  const blocked = new Map();
  for (const functionZid of graph.functionZids) {
    if (closedRec.has(functionZid)) continue;
    for (const leaf of leavesOf(functionZid)) {
      blocked.set(leaf, (blocked.get(leaf) ?? 0) + 1);
    }
  }

  return [...blocked.entries()]
    .map(([zid, blockedFunctions]) => ({
      zid,
      label: graph.label.get(zid) ?? "",
      blockedFunctions,
      hasCodeImplementation: !graph.compositionImplsByFunction.has(zid)
    }))
    .sort((a, b) => b.blockedFunctions - a.blockedFunctions);
}

// What one more primitive would actually buy.
//
// The blocker ranking above counts every function that mentions a leaf
// anywhere below it, which is not the same question and is roughly thirty
// times larger: a function blocked by six leaves is counted by all six, and
// adding any one of them unlocks none of it. This measures the thing that
// decides what to implement next - close the corpus again with the candidate
// added, and report the difference.
//
// Candidates are the blocking leaves, so this is quadratic in the number
// considered; the default takes the top few by the cheap ranking and measures
// only those.
function rankMarginal(graph, primitives, closedRec, blockers, limit) {
  const baseline = closedRec.size;
  const rows = [];
  for (const blocker of blockers.slice(0, limit)) {
    const withCandidate = new Set(primitives);
    withCandidate.add(blocker.zid);
    const closed = closedWithRecursion(graph, withCandidate);
    rows.push({
      zid: blocker.zid,
      label: blocker.label,
      // Less one for the candidate itself, which is not an unlock.
      unlocks: closed.size - baseline - 1,
      blockedFunctions: blocker.blockedFunctions
    });
  }
  return rows.sort((a, b) => b.unlocks - a.unlocks);
}

async function main() {
  const args = process.argv.slice(2);
  const setName = valueOf(args, "--set") ?? "kernel";
  const dbPath = valueOf(args, "--db");
  const outFile = valueOf(args, "--out");
  const asJson = args.includes("--json");
  const primitiveList = PRIMITIVE_SETS[setName];
  if (!primitiveList) {
    console.error(`unknown --set ${setName}; expected ${Object.keys(PRIMITIVE_SETS).join(", ")}`);
    process.exit(2);
  }
  const primitives = new Set(primitiveList);

  const started = Date.now();
  const graph = await loadGraph(dbPath);
  const { closed: nonRecursive, chosen } = closedWithoutRecursion(graph, primitives);
  const withRecursion = closedWithRecursion(graph, primitives);
  const blockers = rankBlockers(graph, primitives, withRecursion);
  const marginalLimit = Number(valueOf(args, "--marginal") ?? 0);
  const marginal = marginalLimit > 0
    ? rankMarginal(graph, primitives, withRecursion, blockers, marginalLimit)
    : [];

  const nonRecursiveFunctions = [...nonRecursive].filter((zid) => !primitives.has(zid)).sort();
  const recursiveOnly = [...withRecursion].filter((zid) => !primitives.has(zid) && !nonRecursive.has(zid)).sort();

  const output = {
    primitiveSet: setName,
    primitives: [...primitives].sort(),
    corpus: graph.counts,
    counts: {
      functionsAnalyzed: graph.functionZids.length,
      closedWithoutRecursion: nonRecursiveFunctions.length,
      closedNeedingRecursion: recursiveOnly.length,
      closedTotal: nonRecursiveFunctions.length + recursiveOnly.length,
      open: graph.functionZids.length - nonRecursiveFunctions.length - recursiveOnly.length
    },
    closedWithoutRecursion: nonRecursiveFunctions.map((zid) => ({
      zid,
      label: graph.label.get(zid) ?? "",
      implementation: chosen.get(zid) ?? null,
      testers: graph.testerCount.get(zid) ?? 0
    })),
    closedNeedingRecursion: recursiveOnly.map((zid) => ({
      zid,
      label: graph.label.get(zid) ?? "",
      testers: graph.testerCount.get(zid) ?? 0
    })),
    topBlockers: blockers.slice(0, 50),
    marginal,
    elapsedMs: Date.now() - started
  };

  if (outFile) await writeFile(outFile, JSON.stringify(output, null, 2), "utf8");
  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`primitive set: ${setName} (${primitives.size} functions)`);
  console.log(`corpus: ${graph.counts.functions} functions, ${graph.counts.compositionImplementations} composition implementations, ${graph.counts.callEdges} call edges`);
  console.log("");
  console.log(`closed without recursion: ${output.counts.closedWithoutRecursion}`);
  console.log(`closed needing recursion: ${output.counts.closedNeedingRecursion}`);
  console.log(`open:                     ${output.counts.open}`);
  console.log("");
  console.log("top blocking leaves (must be added to the kernel):");
  for (const blocker of output.topBlockers.slice(0, 20)) {
    console.log(`  ${blocker.zid.padEnd(9)} ${String(blocker.blockedFunctions).padStart(5)}  ${blocker.label}`);
  }
  if (marginal.length) {
    console.log("");
    console.log("what one more would actually unlock (marginal, not transitive):");
    for (const row of marginal) {
      console.log(
        `  ${row.zid.padEnd(9)} ${String(row.unlocks).padStart(5)} ` +
        `(mentioned by ${row.blockedFunctions})  ${row.label}`);
    }
  }
  console.log(`\n${output.elapsedMs} ms`);
}

function valueOf(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

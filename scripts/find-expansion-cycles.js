#!/usr/bin/env node
// Find function groups whose composition implementations are mutually
// recursive, and report which of them have a code implementation to stop at.
//
// This is not a defect report about Wikifunctions. The wiki resolves each call
// to whichever implementation its orchestrator selects, so a composition that
// calls another function lands in that function's code implementation and
// terminates. The cycle only exists for a tool like this one, which prefers
// composition implementations because those are the ones it can translate.
//
// A group in this report is a group that must be grounded in the primitive
// kernel rather than expanded. If every member has a code implementation, the
// wiki is unaffected and only our expansion needs to stop.
//
//   node scripts/find-expansion-cycles.js [--json]

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function query(sql) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(root, "bin", "wikifn.js"), "db", "query", "--format", "json", sql],
    { maxBuffer: 512 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

// Tarjan's algorithm, iterative so a deep graph cannot overflow the stack.
function stronglyConnected(nodes, edgesOf) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;

  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [{ node: start, edges: edgesOf(start), position: 0 }];
    index.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.position < frame.edges.length) {
        const next = frame.edges[frame.position];
        frame.position += 1;
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, edges: edgesOf(next), position: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node), index.get(next)));
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1].node;
          low.set(parent, Math.min(low.get(parent), low.get(frame.node)));
        }
        if (low.get(frame.node) === index.get(frame.node)) {
          const component = [];
          let member;
          do {
            member = stack.pop();
            onStack.delete(member);
            component.push(member);
          } while (member !== frame.node);
          components.push(component);
        }
      }
    }
  }
  return components;
}

async function main() {
  const asJson = process.argv.includes("--json");
  const [implementations, calls, labels] = await Promise.all([
    query("select zid, function_zid, body_kind from implementations"),
    query("select distinct from_impl_zid, to_function_zid from composition_calls"),
    query("select zid, text from english_labels")
  ]);

  const label = new Map(labels.map((row) => [row.zid, row.text]));
  const bodyKinds = new Map();
  for (const row of implementations) {
    if (!row.function_zid) continue;
    if (!bodyKinds.has(row.function_zid)) bodyKinds.set(row.function_zid, new Set());
    bodyKinds.get(row.function_zid).add(row.body_kind);
  }

  const callsByImpl = new Map();
  for (const row of calls) {
    if (!callsByImpl.has(row.from_impl_zid)) callsByImpl.set(row.from_impl_zid, []);
    callsByImpl.get(row.from_impl_zid).push(row.to_function_zid);
  }

  // Edges between functions, following composition implementations only, which
  // is what an expanding translator does.
  const edges = new Map();
  for (const row of implementations) {
    if (row.body_kind !== "composition" || !row.function_zid) continue;
    const targets = edges.get(row.function_zid) ?? new Set();
    for (const callee of callsByImpl.get(row.zid) ?? []) targets.add(callee);
    edges.set(row.function_zid, targets);
  }

  const nodes = [...new Set([...edges.keys(), ...[...edges.values()].flatMap((s) => [...s])])];
  const edgesOf = (zid) => [...(edges.get(zid) ?? [])];
  const components = stronglyConnected(nodes, edgesOf)
    .filter((component) => component.length > 1 ||
      (component.length === 1 && edgesOf(component[0]).includes(component[0])));

  const groups = components.map((component) => ({
    size: component.length,
    members: component.map((zid) => ({
      zid,
      label: label.get(zid) ?? "",
      hasCode: (bodyKinds.get(zid) ?? new Set()).has("code"),
      hasBuiltin: (bodyKinds.get(zid) ?? new Set()).has("builtin")
    }))
  })).sort((a, b) => b.size - a.size);

  const multi = groups.filter((g) => g.size > 1);
  const everyMemberHasCode = multi.filter((g) =>
    g.members.every((m) => m.hasCode || m.hasBuiltin));

  if (asJson) {
    console.log(JSON.stringify({ groups }, null, 2));
    return;
  }

  console.log(`mutually recursive groups (size > 1): ${multi.length}`);
  console.log(`self-recursive single functions:      ${groups.length - multi.length}`);
  console.log(`groups where every member has code or builtin to stop at: ${everyMemberHasCode.length}`);
  console.log("");
  console.log("These must be grounded in the kernel rather than expanded:");
  for (const group of multi.slice(0, 15)) {
    const safe = group.members.every((m) => m.hasCode || m.hasBuiltin);
    console.log(`  ${group.size} functions${safe ? " (all have code; the wiki is unaffected)" : " (NOT all have code)"}`);
    for (const member of group.members.slice(0, 8)) {
      console.log(`      ${member.zid.padEnd(9)} ${member.hasCode ? "code   " : "no code"}  ${member.label}`);
    }
  }
}

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

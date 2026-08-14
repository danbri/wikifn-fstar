#!/usr/bin/env node
// Run a real Wikifunctions composition in Node, from the extracted F* engine.
//
// Nothing here is an interpreter. docs/generated/wikifn_engine.cjs is F* source
// extracted to OCaml and compiled to JavaScript by js_of_ocaml, and the
// composition bodies inside it are mechanical translations of pinned Z14K2
// trees. This file only reads arguments and prints results.
//
//   node examples/node-engine.js Z10627 "Hello, Wikifunctions!"
//   node examples/node-engine.js Z22294 "१२३४५"
//   node examples/node-engine.js Z12668 '[1,2,3]'
//   node examples/node-engine.js --find reverse
//   node examples/node-engine.js --fuel 400000 Z10627 "a long string"
//
// Build the artifact first if it is missing:  make fstar-engine

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let catalogue;
try {
  catalogue = require(path.join(root, "docs", "generated", "functions.json"));
  require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));
} catch (error) {
  console.error(`Could not load the engine: ${error.message}`);
  console.error("Build it with:  make fstar-engine");
  process.exit(1);
}

// The whole API is two functions, both exported by the extracted artifact.
//
//   wikifnEngineCall(zid, fuel, jsonArgs)     -> JSON string
//   wikifnEngineSource(zid, arity, nameTable) -> JSON string
//
// Both take and return strings because that is what crosses the js_of_ocaml
// boundary cleanly.
const names = JSON.stringify(catalogue.names ?? {});
const byZid = new Map(catalogue.functions.map((entry) => [entry.zid, entry]));

const args = process.argv.slice(2);

function find(needle) {
  const lowered = needle.toLowerCase();
  const hits = catalogue.functions.filter(
    (entry) =>
      entry.zid.toLowerCase().includes(lowered) ||
      (entry.label ?? "").toLowerCase().includes(lowered)
  );
  if (hits.length === 0) {
    console.log(`nothing matches ${needle}`);
    return;
  }
  console.log(`${hits.length} match ${needle}; showing up to 25\n`);
  for (const entry of hits.slice(0, 25)) {
    const types = (entry.argumentKeys ?? [])
      .map((key, index) => `${key}: ${entry.argumentTypes?.[index] ?? "?"}`)
      .join(", ");
    console.log(
      `  ${entry.zid.padEnd(9)} ${(entry.label || entry.name).padEnd(44).slice(0, 44)}` +
      `${entry.runnable ? "" : "  (reaches a gap)"}`
    );
    console.log(`  ${" ".repeat(9)} ${types || "no arguments"} -> ${entry.returnType ?? "?"}`);
  }
}

// Arguments are literal values: a quoted string, a number, true or false, or a
// JSON array of those. Anything else is passed through as text, which is what
// makes the common case - a string - need no quoting of its own.
function parseArgument(raw) {
  if (/^\s*(\[|-?\d+\s*$|true\s*$|false\s*$)/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function main() {
  if (args.length === 0 || args[0] === "--help") {
    console.log("node examples/node-engine.js [--fuel N] <ZID> [argument ...]");
    console.log("node examples/node-engine.js --find <text>");
    console.log(`\n${catalogue.functions.length} functions loaded, ` +
      `${catalogue.functions.filter((f) => f.runnable).length} runnable.`);
    return;
  }

  if (args[0] === "--find") {
    if (!args[1]) {
      console.error("--find needs something to search for");
      process.exit(2);
    }
    find(args.slice(1).join(" "));
    return;
  }

  let fuel = "100000";
  let rest = args;
  if (rest[0] === "--fuel") {
    fuel = rest[1];
    rest = rest.slice(2);
  }

  const zid = rest[0];
  const entry = byZid.get(zid);
  const callArgs = rest.slice(1).map(parseArgument);

  // A primitive is grounded in the F* kernel rather than translated from a
  // composition, so it has no body and is not in the catalogue of
  // compositions - but the engine still runs it. Saying "not found" here would
  // be wrong, and sending the caller to --find would send them nowhere.
  if (!entry) {
    if (!(catalogue.names ?? {})[zid]) {
      console.error(`${zid} is neither a translated composition nor a primitive. Try --find.`);
      process.exit(2);
    }
    console.log(`${zid}  ${catalogue.names[zid]}`);
    console.log("  a primitive: defined in the F* kernel, not translated from a composition");
    console.log(`\ncall  ${zid}(${callArgs.map((a) => JSON.stringify(a)).join(", ")})  fuel ${fuel}`);
    const primitive = JSON.parse(
      globalThis.wikifnEngineCall(zid, fuel, JSON.stringify(callArgs)));
    if (!primitive.ok) {
      console.log(`  ${primitive.error}: ${primitive.message}`);
      process.exit(1);
    }
    console.log(`  ${JSON.stringify(primitive.result)}`);
    return;
  }

  if (callArgs.length !== entry.arity) {
    console.error(`${zid} takes ${entry.arity} argument(s), got ${callArgs.length}`);
    process.exit(2);
  }

  const signature = (entry.argumentKeys ?? [])
    .map((key, index) => `${key}: ${entry.argumentTypes?.[index] ?? "?"}`)
    .join(", ");
  console.log(`${entry.zid}  ${entry.label || entry.name}`);
  console.log(`  ${signature || "no arguments"} -> ${entry.returnType ?? "?"}   (declared, not checked)`);
  console.log(`  from implementation ${entry.implementation} revision ${entry.revision}`);

  // Printed by Wikifn.Print, the same checked F* module the evaluator uses, so
  // what is shown and what runs cannot disagree.
  try {
    const rendered = JSON.parse(
      globalThis.wikifnEngineSource(zid, String(entry.arity), names));
    if (rendered.ok) console.log(`\n${rendered.source}`);
  } catch {
    console.log("\n(source too deep for the printer)");
  }

  console.log(`\ncall  ${zid}(${callArgs.map((a) => JSON.stringify(a)).join(", ")})  fuel ${fuel}`);
  let response;
  try {
    response = JSON.parse(globalThis.wikifnEngineCall(zid, fuel, JSON.stringify(callArgs)));
  } catch (error) {
    // Evaluation nested deeper than the host stack allows. Reported, not hidden.
    console.log(`  host stack exhausted: ${error.message}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.log(`  ${response.error}: ${response.message}`);
    process.exit(1);
  }
  console.log(`  ${JSON.stringify(response.result)}`);
}

main();

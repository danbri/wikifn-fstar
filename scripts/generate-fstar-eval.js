#!/usr/bin/env node
// Generate F* interpreter bodies for every composition that closes over the
// Wikifn.Eval primitive set.
//
// This is mechanical translation, not authoring: each body is the pinned
// Z14K2 composition tree rewritten as a Wikifn.Eval expr. Provenance (revision
// and digest) is recorded per function. Anything the translator cannot express
// is skipped and counted, never guessed at.
//
// Arguments become EArg indices rather than inlined expressions. Inlining is
// what makes a body that mentions an argument twice cost twice as much, which
// compounds to 2^depth when such calls nest.
//
//   node scripts/generate-fstar-eval.js [--limit N] [--report FILE]

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.join(root, "cache", "wikifunctions");
const outPath = path.join(root, "src", "fstar", "Wikifn.Generated.Eval.fst");
const catalogPath = path.join(root, "docs", "generated", "functions.json");

// Must match apply_primitive and higher_order in src/fstar/Wikifn.Eval.fst.
const PRIMITIVES = new Set([
  "Z801", "Z802", "Z866", "Z810", "Z811", "Z812", "Z813", "Z821", "Z822",
  "Z872", "Z873", "Z876", "Z10000", "Z10008", "Z10075", "Z10174", "Z10184",
  "Z10216", "Z10615", "Z10901", "Z11040", "Z12681", "Z13522", "Z13569",
  "Z13582", "Z13676", "Z13682", "Z13689", "Z13695", "Z14124", "Z14456",
  "Z14520",
  // Arithmetic, grounded in the kernel rather than expanded. The Peano-style
  // compositions for these are mutually circular (increment is add(n,1) and add
  // is defined via increment), so unfolding them does not terminate.
  "Z13521", "Z13539", "Z13578", "Z13630", "Z13633", "Z13647", "Z13846",
  // Text and codepoint lists are the same data in two shapes.
  "Z22693", "Z22717"
]);

const INTERNAL_FRESH_PRIVATE_USE = "1000000001";

// Where Wikifunctions has reinvented something LISP already named, use the
// classical name. The wiki label is kept in the legend at the top of the
// s-expression output, so the mapping back to identifiers stays mechanical.
const CLASSIC_NAMES = new Map([
  ["Z801", "identity"], ["Z802", "if"],
  ["Z810", "cons"], ["Z811", "car"], ["Z812", "cdr"], ["Z813", "null?"],
  ["Z821", "fst"], ["Z822", "snd"],
  ["Z872", "filter"], ["Z873", "map"], ["Z876", "fold"],
  ["Z866", "string=?"], ["Z10000", "string-append"],
  ["Z10216", "not"], ["Z10174", "and"], ["Z10184", "or"],
  ["Z12681", "length"], ["Z11040", "string-length"],
  ["Z13522", "="], ["Z13676", ">"], ["Z13682", ">="], ["Z13689", "<"], ["Z13695", "<="],
  ["Z13521", "+"], ["Z13539", "*"], ["Z13578", "add1"], ["Z13630", "max"],
  ["Z13633", "min"], ["Z13647", "expt"], ["Z13846", "if"]
]);

const objectCache = new Map();
const argOrderCache = new Map();

async function query(sql) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(root, "bin", "wikifn.js"), "db", "query", "--format", "json", sql],
    { maxBuffer: 512 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

async function loadObject(zid) {
  if (objectCache.has(zid)) return objectCache.get(zid);
  let entry;
  try {
    const dir = path.join(cacheDir, "objects", zid);
    const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    if (files.length === 0) throw new Error("no revisions");
    files.sort((a, b) => Number(path.basename(a, ".json")) - Number(path.basename(b, ".json")));
    entry = JSON.parse(await readFile(path.join(dir, files[files.length - 1]), "utf8"));
  } catch {
    entry = undefined;
  }
  objectCache.set(zid, entry);
  return entry;
}

function refZid(value) {
  if (typeof value === "string" && /^Z[1-9][0-9]*$/.test(value)) return value;
  if (value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string") return value.Z9K1;
  return undefined;
}

function stringOf(value) {
  if (typeof value === "string") return value;
  if (value?.Z1K1 === "Z6" && typeof value.Z6K1 === "string") return value.Z6K1;
  return undefined;
}

function zListItems(value) {
  return Array.isArray(value) ? value.slice(1) : undefined;
}

// Declared argument keys, in order, so Z18 references resolve to indices.
async function argumentKeys(zid) {
  if (argOrderCache.has(zid)) return argOrderCache.get(zid);
  const object = await loadObject(zid);
  const z8 = object?.canonical?.Z2K2;
  let keys;
  if (z8?.Z1K1 !== "Z8") keys = undefined;
  else {
    const items = zListItems(z8.Z8K1);
    keys = items ? items.map((decl) => stringOf(decl.Z17K2)).filter(Boolean) : undefined;
    if (keys && keys.length !== (items?.length ?? -1)) keys = undefined;
  }
  argOrderCache.set(zid, keys);
  return keys;
}

class Unsupported extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function textLiteral(text) {
  return `[${Array.from(text, (ch) => ch.codePointAt(0)).join("; ")}]`;
}

// The private-use marker idiom: first character of the private-use range not
// already present in the input. Recognised structurally rather than by ZID so
// it survives an implementation being re-pointed.
function markerIdiom(term) {
  if (refZid(term?.Z1K1) !== "Z7" || refZid(term?.Z7K1) !== "Z10901") return undefined;
  const inner = term.Z10901K1;
  if (refZid(inner?.Z1K1) !== "Z7" || refZid(inner?.Z7K1) !== "Z14520") return undefined;
  const range = inner.Z14520K1;
  if (refZid(range?.Z1K1) !== "Z7" || refZid(range?.Z7K1) !== "Z14124") return undefined;
  const first = stringOf(range.Z14124K1?.Z13518K1);
  const last = stringOf(range.Z14124K2?.Z13518K1);
  if (first !== "60928" || last !== "63487") return undefined;
  return inner.Z14520K2;
}

async function translate(term, context) {
  const marker = markerIdiom(term);
  if (marker) {
    return { kind: "call", zid: `Z${INTERNAL_FRESH_PRIVATE_USE}`, args: [await translate(marker, context)] };
  }

  if (typeof term === "string") {
    const zid = refZid(term);
    // Z41 and Z42 are the boolean values, not references to functions.
    if (zid === "Z41") return { kind: "bool", value: true };
    if (zid === "Z42") return { kind: "bool", value: false };
    if (zid) return { kind: "func", zid };
    return { kind: "text", value: term };
  }

  if (Array.isArray(term)) {
    const items = zListItems(term);
    if (!items) throw new Unsupported("malformed typed list literal");
    const translated = [];
    for (const item of items) {
      const value = await translate(item, context);
      if (!isLiteral(value)) throw new Unsupported("non-literal element in list");
      translated.push(value);
    }
    return { kind: "list", items: translated };
  }

  if (!term || typeof term !== "object") throw new Unsupported("unsupported term");

  const type = refZid(term.Z1K1);

  if (type === "Z18") {
    const key = stringOf(term.Z18K1);
    const index = context.argIndex.get(key);
    if (index === undefined) throw new Unsupported(`unbound argument ${key}`);
    return { kind: "arg", index };
  }

  if (type === "Z6") return { kind: "text", value: stringOf(term) ?? "" };

  if (type === "Z13518") {
    const raw = stringOf(term.Z13518K1);
    if (!/^[0-9]+$/.test(raw ?? "")) throw new Unsupported("non-decimal natural literal");
    return { kind: "nat", value: raw };
  }

  if (type === "Z40") {
    const identity = refZid(term.Z40K1);
    if (identity === "Z41") return { kind: "bool", value: true };
    if (identity === "Z42") return { kind: "bool", value: false };
    throw new Unsupported("boolean is neither Z41 nor Z42");
  }

  if (type === "Z9") {
    const target = refZid(term.Z9K1);
    if (!target) throw new Unsupported("reference without a target");
    if (target === "Z41") return { kind: "bool", value: true };
    if (target === "Z42") return { kind: "bool", value: false };
    return { kind: "func", zid: target };
  }

  if (type !== "Z7") throw new Unsupported(`object of type ${type ?? "unknown"}`);

  const functionZid = refZid(term.Z7K1);
  if (!functionZid) throw new Unsupported("call to a computed function reference");

  const keys = await argumentKeys(functionZid);
  if (!keys) throw new Unsupported(`unknown argument order for ${functionZid}`);

  const args = [];
  for (const key of keys) {
    if (!(key in term)) throw new Unsupported(`${functionZid} call is missing ${key}`);
    args.push(await translate(term[key], context));
  }
  return { kind: "call", zid: functionZid, args, calleeKeys: keys };
}

const isLiteral = (node) =>
  ["text", "nat", "bool", "func", "list"].includes(node.kind);

// --- renderers -------------------------------------------------------------

function renderFstarValue(node) {
  switch (node.kind) {
    case "text": return `VText ${textLiteral(node.value)}`;
    case "nat": return `VNat ${node.value}`;
    case "bool": return `VBool ${node.value}`;
    case "func": return `VFunc ${node.zid.slice(1)}`;
    case "list": return `VList [${node.items.map(renderFstarValue).join("; ")}]`;
    default: throw new Unsupported(`not a value: ${node.kind}`);
  }
}

function renderFstar(node) {
  if (node.kind === "arg") return `EArg ${node.index}`;
  if (node.kind === "call") {
    return `ECall ${node.zid.slice(1)} [${node.args.map(renderFstar).join("; ")}]`;
  }
  return `EValue (${renderFstarValue(node)})`;
}

// Canonical Wikifunctions rendering. This is the constraint that keeps the F*
// representation honest: anything expressible in this tree can be emitted back
// as a real Z14K2 composition body with no further interpretation. If a form
// cannot be rendered here, it does not belong in the tree.
function renderZ14K2(node, argKeys) {
  switch (node.kind) {
    case "arg":
      return { Z1K1: "Z18", Z18K1: argKeys[node.index] };
    case "text":
      return { Z1K1: "Z6", Z6K1: node.value };
    case "nat":
      return { Z1K1: "Z13518", Z13518K1: { Z1K1: "Z6", Z6K1: node.value } };
    case "bool":
      return { Z1K1: "Z40", Z40K1: node.value ? "Z41" : "Z42" };
    case "boolref":
      return node.value ? "Z41" : "Z42";
    case "func":
      return node.zid;
    case "list":
      return ["Z1", ...node.items.map((item) => renderZ14K2(item, argKeys))];
    case "call": {
      if (node.zid === `Z${INTERNAL_FRESH_PRIVATE_USE}`) {
        // The marker helper is an optimisation, not a Wikifunctions function.
        // Emit the idiom it stands for so the output stays contributable.
        return {
          Z1K1: "Z7",
          Z7K1: "Z10901",
          Z10901K1: {
            Z1K1: "Z7",
            Z7K1: "Z14520",
            Z14520K1: {
              Z1K1: "Z7",
              Z7K1: "Z14124",
              Z14124K1: { Z1K1: "Z13518", Z13518K1: { Z1K1: "Z6", Z6K1: "60928" } },
              Z14124K2: { Z1K1: "Z13518", Z13518K1: { Z1K1: "Z6", Z6K1: "63487" } }
            },
            Z14520K2: renderZ14K2(node.args[0], argKeys)
          }
        };
      }
      const call = { Z1K1: "Z7", Z7K1: node.zid };
      const keys = node.calleeKeys;
      if (!keys || keys.length !== node.args.length) {
        throw new Unsupported(`cannot render ${node.zid} call without its argument keys`);
      }
      node.args.forEach((argument, index) => {
        call[keys[index]] = renderZ14K2(argument, argKeys);
      });
      return call;
    }
    default:
      throw new Unsupported(`cannot render ${node.kind} as a composition`);
  }
}

// S-expression rendering. Names carry the ZID first so the text maps back to
// plain Wikifunctions identifiers mechanically, while still reading as English.
function renderSexpr(node, names, argNames) {
  switch (node.kind) {
    case "arg": return argNames[node.index] ?? `arg${node.index}`;
    case "text": return JSON.stringify(node.value);
    case "nat": return node.value;
    case "bool": return node.value ? "#t" : "#f";
    case "func": return names(node.zid);
    case "list": return `(list ${node.items.map((i) => renderSexpr(i, names, argNames)).join(" ")})`;
    case "call": {
      const parts = node.args.map((a) => renderSexpr(a, names, argNames));
      const head = names(node.zid);
      const oneLine = `(${head} ${parts.join(" ")})`;
      if (oneLine.length <= 96) return oneLine;
      return `(${head}\n    ${parts.join("\n    ")})`;
    }
    default: throw new Unsupported(`cannot render ${node.kind}`);
  }
}

// Names keep the ZID so the mapping back to plain Wikifunctions identifiers is
// mechanical: Z22294_devanagari_digits_to_arabic_digits reads as English but
// its first token is the identifier, so a reader who trusts the words and a
// reader who needs the identifier are both served. English here; the dump
// carries other languages and the scheme is the same for any of them.
// Every function ZID a translated body calls.
function collectCalls(node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (node.kind === "call") {
    acc.push(node.zid);
    for (const argument of node.args) collectCalls(argument, acc);
  } else if (node.kind === "list") {
    for (const item of node.items) collectCalls(item, acc);
  } else if (node.kind === "func") {
    acc.push(node.zid);
  }
  return acc;
}

// Tarjan's algorithm, iterative so a deep graph cannot overflow the stack.
function stronglyConnected(nodes, edgesOf) {
  const index = new Map(), low = new Map(), onStack = new Set();
  const stack = [], components = [];
  let counter = 0;
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [{ node: start, edges: edgesOf(start), position: 0 }];
    index.set(start, counter); low.set(start, counter); counter += 1;
    stack.push(start); onStack.add(start);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.position < frame.edges.length) {
        const next = frame.edges[frame.position];
        frame.position += 1;
        if (!index.has(next)) {
          index.set(next, counter); low.set(next, counter); counter += 1;
          stack.push(next); onStack.add(next);
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
          do { member = stack.pop(); onStack.delete(member); component.push(member); }
          while (member !== frame.node);
          components.push(component);
        }
      }
    }
  }
  return components;
}

function sanitize(label, zid, used) {
  let base = (label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  if (base.length > 60) base = base.slice(0, 60).replace(/_+$/, "");
  const name = base ? `${zid}_${base}` : zid;
  used.add(name);
  return name;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = Number(valueOf(args, "--limit") ?? 0);
  const reportPath = valueOf(args, "--report");

  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(root, "scripts", "analyze-closure.js"), "--set", "engine", "--json"],
    { maxBuffer: 512 * 1024 * 1024 }
  );
  const closure = JSON.parse(stdout);
  const closed = new Set([
    ...closure.closedWithoutRecursion.map((entry) => entry.zid),
    ...closure.closedNeedingRecursion.map((entry) => entry.zid),
    ...closure.primitives
  ]);

  const implementations = await query(
    "select zid, function_zid, body_kind from implementations where body_kind='composition'"
  );
  const callRows = await query("select distinct from_impl_zid, to_function_zid from composition_calls");
  const labelRows = await query("select zid, text from english_labels");
  const labels = new Map(labelRows.map((row) => [row.zid, row.text]));

  const callsByImpl = new Map();
  for (const row of callRows) {
    if (!callsByImpl.has(row.from_impl_zid)) callsByImpl.set(row.from_impl_zid, []);
    callsByImpl.get(row.from_impl_zid).push(row.to_function_zid);
  }
  const implsByFunction = new Map();
  for (const row of implementations) {
    if (!row.function_zid) continue;
    if (!implsByFunction.has(row.function_zid)) implsByFunction.set(row.function_zid, []);
    implsByFunction.get(row.function_zid).push(row.zid);
  }

  // Emit every composition we can translate, not only those whose whole
  // transitive closure is already grounded. Calls are by reference: the
  // evaluator looks a body up when the call happens, so a function whose
  // callees are not yet implemented is still worth carrying. It simply reports
  // "no implementation" if evaluation actually reaches the gap, and it starts
  // working the moment that gap is filled, with no regeneration.
  const targets = [...implsByFunction.keys()]
    .filter((zid) => !PRIMITIVES.has(zid))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const used = new Set();
  const emitted = [];
  const skipped = [];

  for (const functionZid of targets) {
    if (limit && emitted.length >= limit) break;

    const keys = await argumentKeys(functionZid);
    if (!keys) {
      skipped.push({ zid: functionZid, reason: "unreadable argument declaration" });
      continue;
    }
    const argIndex = new Map(keys.map((key, index) => [key, index]));
    // Local key spellings (K1) refer to the same argument positions.
    keys.forEach((key, index) => {
      const local = /K[1-9][0-9]*$/.exec(key);
      if (local) argIndex.set(local[0], index);
    });

    // Translate every candidate implementation. Which one to keep is decided
    // later, once it is known which functions actually run: a function can have
    // several composition implementations, and picking arbitrarily among them
    // is how ROT13 ended up as thirteen nested rot1 calls that do not evaluate.
    const all = implsByFunction.get(functionZid) ?? [];
    const translations = [];
    let failure;
    for (const implZid of all) {
      const implementation = await loadObject(implZid);
      const body = implementation?.canonical?.Z2K2?.Z14K2;
      if (!body) { failure = "implementation has no composition body in cache"; continue; }
      try {
        const tree = await translate(body, { argIndex });
        renderFstar(tree);
        translations.push({
          zid: implZid,
          revision: implementation.revision,
          digest: implementation.digest,
          tree,
          calls: [...new Set(collectCalls(tree))]
        });
      } catch (error) {
        failure = error instanceof Unsupported ? error.reason : String(error.message ?? error);
      }
    }

    if (translations.length === 0) {
      skipped.push({ zid: functionZid, reason: failure ?? "no usable implementation" });
      continue;
    }

    const chosen = translations[0];
    const translated = chosen.tree;

    // Round-trip check: render the tree back to a canonical composition, read it
    // again, and require an identical tree. This is what makes the F* form
    // mechanically convertible into Wikifunctions data rather than only derived
    // from it.
    let roundTrip = "not attempted";
    try {
      const rendered = renderZ14K2(translated, keys);
      const reread = await translate(rendered, { argIndex });
      roundTrip = JSON.stringify(reread) === JSON.stringify(translated) ? "identical" : "differs";
    } catch (error) {
      roundTrip = `render failed: ${error.reason ?? error.message}`;
    }

    const functionObject = await loadObject(functionZid);
    emitted.push({
      roundTrip,
      zid: functionZid,
      number: functionZid.slice(1),
      name: sanitize(labels.get(functionZid), functionZid, used),
      label: labels.get(functionZid) ?? "",
      arity: keys.length,
      // Callees this body actually mentions, so runnability can be computed
      // from what was emitted rather than from what the corpus analysis hoped
      // for. The analysis can call a function closed while the translator has
      // skipped one of its callees.
      calls: chosen.calls,
      translations,
      argNames: keys.map((key, index) => `a${index}`),
      argKeys: keys,
      tree: translated,
      implementation: { zid: chosen.zid, revision: chosen.revision, digest: chosen.digest },
      functionRevision: functionObject?.revision ?? 0,
    });
  }

  const emittedIndex = new Map(emitted.map((entry) => [entry.zid, entry]));
  const isPrimitive = (zid) => PRIMITIVES.has(zid) || zid === `Z${INTERNAL_FRESH_PRIVATE_USE}`;

  // Choose which implementation each function uses, preferring one whose calls
  // all reach something that exists. Repeat until no choice improves, since one
  // function becoming reachable can make another's alternative viable.
  const reaches = (calls, ok, self) =>
    calls.every((callee) => isPrimitive(callee) || callee === self || ok.has(callee));

  let improved = true;
  let rounds = 0;
  while (improved && rounds < 12) {
    improved = false;
    rounds += 1;
    const ok = new Set(emittedIndex.keys());
    let shrinking = true;
    while (shrinking) {
      shrinking = false;
      for (const zid of [...ok]) {
        if (!reaches(emittedIndex.get(zid).calls, ok, zid)) { ok.delete(zid); shrinking = true; }
      }
    }
    for (const entry of emitted) {
      if (ok.has(entry.zid)) continue;
      const better = entry.translations.find((candidate) => reaches(candidate.calls, ok, entry.zid));
      if (better) {
        entry.tree = better.tree;
        entry.calls = better.calls;
        entry.implementation = { zid: better.zid, revision: better.revision, digest: better.digest };
        improved = true;
      }
    }

    // Break mutual recursion where an implementation exists that avoids it.
    // Two functions defined in terms of each other with no base case are true
    // as equations and unproductive as definitions: Z844 boolean equality is
    // not(inequality) while Z10237 inequality is not(equality). Z844 also has
    // an implementation that is nested ifs over booleans, and that one works.
    // Self-recursion is left alone; it is ordinary and usually has a guard.
    const memberOf = new Map();
    const groups = stronglyConnected(
      [...emittedIndex.keys()],
      (zid) => (emittedIndex.get(zid)?.calls ?? []).filter((c) => emittedIndex.has(c))
    );
    for (const group of groups) {
      if (group.length < 2) continue;
      for (const zid of group) memberOf.set(zid, new Set(group));
    }
    for (const entry of emitted) {
      const group = memberOf.get(entry.zid);
      if (!group) continue;
      // Escaping a cycle must not cost reachability: only switch to a
      // candidate that still reaches something implemented.
      const escapes = entry.translations.find((candidate) =>
        candidate.calls.every((callee) => callee === entry.zid || !group.has(callee)) &&
        reaches(candidate.calls, ok, entry.zid));
      if (escapes && escapes.zid !== entry.implementation.zid) {
        entry.tree = escapes.tree;
        entry.calls = escapes.calls;
        entry.implementation = { zid: escapes.zid, revision: escapes.revision, digest: escapes.digest };
        improved = true;
      }
    }
  }


  const lines = [
    "module Wikifn.Generated.Eval",
    "",
    "open Wikifn.Primitive.Kernel",
    "open Wikifn.Zid",
    "open Wikifn.Eval",
    "",
    "(*",
    "  Generated by scripts/generate-fstar-eval.js from pinned cache objects.",
    "  Do not edit. Every body below is a mechanical translation of a pinned",
    "  Z14K2 composition; none of it is authored.",
    "",
    `  functions: ${emitted.length}`,
    `  skipped:   ${skipped.length}`,
    "*)",
    ""
  ];

  for (const entry of emitted) {
    lines.push(
      `(* ${entry.zid} ${entry.label} | ${entry.zid}@${entry.functionRevision}` +
      ` -> ${entry.implementation.zid}@${entry.implementation.revision}` +
      ` digest ${entry.implementation.digest} *)`
    );
    lines.push(`let body_${entry.name} : expr =`);
    lines.push(`  ${renderFstar(entry.tree)}`);
    lines.push("");
  }

  lines.push("let generated_policy (fid:zid) : Tot (option expr) =");
  lines.push("  match fid with");
  for (const entry of emitted) {
    lines.push(`  | ${entry.number} -> Some body_${entry.name}`);
  }
  lines.push("  | _ -> None");
  lines.push("");

  await writeFile(outPath, lines.join("\n"), "utf8");

  // A function is runnable when every function reachable from its body is
  // either a primitive or itself emitted. Cycles are fine: the interpreter is
  // fuel-bounded, so mutual recursion terminates with an error rather than
  // hanging. This is a greatest fixpoint - assume runnable, then remove any
  // function that reaches something nobody implements.
  const available = new Set([...PRIMITIVES, `Z${INTERNAL_FRESH_PRIVATE_USE}`, ...emittedIndex.keys()]);
  const runnable = new Set(emittedIndex.keys());
  let shrinking = true;
  while (shrinking) {
    shrinking = false;
    for (const zid of [...runnable]) {
      const entry = emittedIndex.get(zid);
      const reachesGap = entry.calls.some((callee) =>
        !PRIMITIVES.has(callee) && callee !== `Z${INTERNAL_FRESH_PRIVATE_USE}` && !runnable.has(callee));
      if (reachesGap) {
        runnable.delete(zid);
        shrinking = true;
      }
    }
  }
  for (const entry of emitted) entry.runnable = runnable.has(entry.zid);

  // Functions left in a mutual-recursion cycle after implementation choice.
  // These may be unproductive, and a Scheme has no depth guard to catch it, so
  // the listing marks them.
  const finalGroups = stronglyConnected(
    [...emittedIndex.keys()],
    (zid) => (emittedIndex.get(zid)?.calls ?? []).filter((c) => emittedIndex.has(c))
  );
  const inCycle = new Set();
  for (const group of finalGroups) {
    if (group.length > 1) for (const zid of group) inCycle.add(zid);
  }
  for (const entry of emitted) entry.mutuallyRecursive = inCycle.has(entry.zid);

  const emittedByZid = new Map(emitted.map((entry) => [entry.zid, entry]));
  const usedClassics = new Map();
  const nameOf = (zid) => {
    const classic = CLASSIC_NAMES.get(zid);
    if (classic) {
      usedClassics.set(zid, classic);
      return classic;
    }
    const entry = emittedByZid.get(zid);
    if (entry) return entry.name;
    const label = labels.get(zid);
    return label ? sanitize(label, zid, new Set()) : zid;
  };

  // Catalogue for the JavaScript layer: call by natural-language name as well
  // as by ZID.
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        generated: "scripts/generate-fstar-eval.js",
        // Every name a rendered body can mention, so the printer in F* can be
        // handed a complete table.
        names: Object.fromEntries([
          ...emitted.map((entry) => [entry.zid, entry.name]),
          ...[...PRIMITIVES].map((zid) => [zid, sanitize(labels.get(zid), zid, new Set())])
        ]),
        primitives: [...CLASSIC_NAMES.entries()].map(([zid, classic]) => ({
          zid,
          classic,
          label: labels.get(zid) ?? ""
        })),
        functions: emitted.map((entry) => ({
          zid: entry.zid,
          name: entry.name,
          label: entry.label,
          arity: entry.arity,
          runnable: entry.runnable,
          mutuallyRecursive: entry.mutuallyRecursive,
          argumentKeys: entry.argKeys,

          implementation: entry.implementation.zid,
          revision: entry.implementation.revision,
          digest: entry.implementation.digest
        }))
      },
      null,
      2
    ),
    "utf8"
  );

  // The s-expression listing is produced from the F* printer after the engine
  // is built; see scripts/export-all-scheme.js.


  // The contributable form: each body rendered back to a canonical Z14K2 tree.
  const compositions = {};
  for (const entry of emitted) {
    if (entry.roundTrip !== "identical") continue;
    compositions[entry.zid] = {
      label: entry.label,
      arguments: entry.argKeys,
      Z14K2: renderZ14K2(entry.tree, entry.argKeys)
    };
  }
  await writeFile(
    path.join(root, "docs", "generated", "wikifn-compositions.json"),
    JSON.stringify({ generated: "scripts/generate-fstar-eval.js", compositions }, null, 2),
    "utf8"
  );

  const reasons = new Map();
  for (const entry of skipped) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
  const report = {
    candidates: targets.length,
    emitted: emitted.length,
    skipped: skipped.length,
    skippedByReason: [...reasons.entries()].map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    skippedFunctions: skipped
  };
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  const roundTripCounts = new Map();
  for (const entry of emitted) {
    roundTripCounts.set(entry.roundTrip, (roundTripCounts.get(entry.roundTrip) ?? 0) + 1);
  }
  const runnableCount = emitted.filter((e) => e.runnable).length;
  console.log(`candidates ${targets.length}, emitted ${emitted.length}, skipped ${skipped.length}`);
  console.log(`  of the emitted, ${runnableCount} are runnable and ${emitted.length - runnableCount} reach a gap`);
  console.log("round trip to canonical Wikifunctions composition:");
  for (const [status, count] of roundTripCounts) console.log(`  ${String(count).padStart(4)}  ${status}`);
  for (const row of report.skippedByReason.slice(0, 12)) {
    console.log(`  ${String(row.count).padStart(4)}  ${row.reason}`);
  }
  console.log(outPath);
  console.log(catalogPath);
  console.log(path.join(root, "docs", "generated", "wikifn.scm"));
}

function valueOf(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

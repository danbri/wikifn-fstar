#!/usr/bin/env node
// Export a Wikifunctions function and its dependencies as a small standalone
// JavaScript module.
//
// The extracted engine is 1.2 MB, because it carries the F* evaluator, the
// js_of_ocaml runtime, bignum stubs and all 3,823 composition bodies. That is
// the right thing to load when you want the whole corpus. It is the wrong thing
// to make someone download to test whether a string is a palindrome: that
// function's entire transitive closure is four definitions and 358 bytes of
// s-expression.
//
// So this emits, for one function, just its closure - the way
// scripts/export-scheme.js already does for Scheme.
//
//   node scripts/export-js.js Z10096 Z10052 --out docs/generated/js
//   node scripts/export-js.js Z10627 --check
//
// HONESTY, and it matters: the composition bodies below are mechanically
// translated from the same s-expressions the F* printer produces, so they say
// what the corpus says. The primitives are NOT extracted from F* - they are
// written in JavaScript in this file, the same second implementation that
// export-scheme.js makes in Scheme, and the same caveat applies: it is the same
// intent written twice, and two implementations can disagree.
//
// --check is what makes that trade defensible. It runs the exported module and
// the F*-extracted engine over the same inputs and requires identical answers.
// Do not ship an export that has not passed it.

import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogue = require(path.join(root, "docs", "generated", "functions.json"));
require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));

const byZid = new Map(catalogue.functions.map((entry) => [entry.zid, entry]));
const names = JSON.stringify(catalogue.names ?? {});

const sourceCache = new Map();
function sourceOf(zid) {
  if (sourceCache.has(zid)) return sourceCache.get(zid);
  const entry = byZid.get(zid);
  let text = null;
  if (entry) {
    const rendered = JSON.parse(
      globalThis.wikifnEngineSource(zid, String(entry.arity), names));
    if (rendered.ok) text = rendered.source;
  }
  sourceCache.set(zid, text);
  return text;
}

// --- reading the s-expression ------------------------------------------------
//
// The printer's output is regular: parenthesised forms, bare atoms, and string
// literals. That is the whole grammar.

function parse(text) {
  let index = 0;
  function skip() {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  }
  function read() {
    skip();
    if (text[index] === "(") {
      index += 1;
      const items = [];
      for (;;) {
        skip();
        if (text[index] === ")") { index += 1; return items; }
        if (index >= text.length) throw new Error("unbalanced s-expression");
        items.push(read());
      }
    }
    if (text[index] === '"') {
      index += 1;
      let out = "";
      while (text[index] !== '"') {
        if (text[index] === "\\") { out += text[index + 1]; index += 2; continue; }
        out += text[index];
        index += 1;
      }
      index += 1;
      return { string: out };
    }
    let atom = "";
    while (index < text.length && !/[\s()]/.test(text[index])) { atom += text[index]; index += 1; }
    if (atom === "") throw new Error(`cannot read at ${index}`);
    return { atom };
  }
  const form = read();
  skip();
  if (index !== text.length) throw new Error("trailing text after s-expression");
  return form;
}

// --- rendering to JavaScript -------------------------------------------------

// The name the printer uses, for compositions and primitives alike. Taken from
// the catalogue rather than rebuilt here, so a relabelled function cannot make
// the prelude and the bodies disagree about what something is called.
const jsName = (zid) => (catalogue.names ?? {})[zid] ?? zid;

// Operators Scheme spells one way and JavaScript another. `if` is a ternary,
// which keeps it lazy in its branches - and it must stay lazy, because most
// recursive compositions in the corpus guard their recursive branch with it.
const INFIX = { "+": "+", "*": "*", "=": "===", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };

const PRIMITIVE_JS = new Map([
  ["identity", "identity"], ["cons", "cons"], ["car", "car"], ["cdr", "cdr"],
  ["null?", "isNull"], ["fst", "fst"], ["snd", "snd"], ["not", "not"],
  ["string=?", "stringEq"], ["string-append", "stringAppend"],
  ["string-length", "stringLength"], ["length", "listLength"],
  ["map", "map"], ["filter", "filter"], ["fold", "fold"],
  ["bool-and", "boolAnd"], ["bool-or", "boolOr"],
  ["add1", "add1"], ["max", "maxOf"], ["min", "minOf"], ["expt", "expt"],
  ["fresh-private-use-char", "freshPrivateUseChar"],
  // The same operators in value position, where map and fold take them as
  // arguments. In call position the INFIX table above renders them inline.
  ["+", "plus"], ["*", "times"], ["=", "numEq"],
  ["<", "lessThan"], ["<=", "lessOrEqual"], [">", "greaterThan"], [">=", "greaterOrEqual"],
  ["list", "list"], ["record", "record"]
]);

function renderJs(form, argNames, used) {
  if (form.string !== undefined) return JSON.stringify(form.string);
  if (form.atom !== undefined) {
    const atom = form.atom;
    if (atom === "#t") return "true";
    if (atom === "#f") return "false";
    if (/^-?\d+$/.test(atom)) return atom;
    if (argNames.includes(atom)) return atom;
    // A bare function name in value position, as map and fold take.
    const zid = /^(Z[1-9][0-9]*)_/.exec(atom)?.[1];
    if (zid) { used.add(zid); return jsName(zid); }
    const primitive = PRIMITIVE_JS.get(atom);
    // Recorded under the JavaScript name, which is how the prelude is keyed.
    if (primitive) { used.add(primitive); return primitive; }
    throw new Error(`unknown name in value position: ${atom}`);
  }

  if (form.length === 0) throw new Error("empty form");
  const head = form[0];
  if (head.atom === undefined) throw new Error("a form's head must be a name");
  const name = head.atom;
  const args = form.slice(1);

  if (name === "if") {
    if (args.length !== 3) throw new Error("if takes three arguments");
    const [condition, consequent, alternative] = args.map((a) => renderJs(a, argNames, used));
    return `(${condition} ? ${consequent} : ${alternative})`;
  }
  if (name === "list") {
    used.add("list");
    return `[${args.map((a) => renderJs(a, argNames, used)).join(", ")}]`;
  }
  if (name === "record") {
    used.add("record");
    const [type, ...fields] = args;
    const pairs = fields.map((field) => {
      const key = field[0].atom;
      return `${JSON.stringify(key)}: ${renderJs(field[1], argNames, used)}`;
    });
    return `({ type: ${JSON.stringify(type.atom)}, fields: { ${pairs.join(", ")} } })`;
  }
  if (INFIX[name] && args.length === 2) {
    const [left, right] = args.map((a) => renderJs(a, argNames, used));
    return `(${left} ${INFIX[name]} ${right})`;
  }

  const rendered = args.map((a) => renderJs(a, argNames, used));
  const zid = /^(Z[1-9][0-9]*)_/.exec(name)?.[1];
  if (zid) { used.add(zid); return `${jsName(zid)}(${rendered.join(", ")})`; }
  const primitive = PRIMITIVE_JS.get(name);
  if (primitive) { used.add(primitive); return `${primitive}(${rendered.join(", ")})`; }
  throw new Error(`unknown function: ${name}`);
}

function renderDefinition(zid, used) {
  const text = sourceOf(zid);
  if (!text) throw new Error(`${zid} has no printed source`);
  const form = parse(text);
  if (form[0]?.atom !== "define") throw new Error(`${zid} is not a definition`);
  const header = form[1];
  const argNames = header.slice(1).map((a) => a.atom);
  const body = renderJs(form[2], argNames, used);
  const entry = byZid.get(zid);
  return [
    `// ${zid} ${entry.label} | from implementation ${entry.implementation}`,
    `//   revision ${entry.revision} digest ${entry.digest}`,
    `export function ${jsName(zid)}(${argNames.join(", ")}) {`,
    `  return ${body};`,
    "}"
  ].join("\n");
}

// --- the prelude -------------------------------------------------------------
//
// Written here, in JavaScript. Not extracted from F*.

const PRELUDE = new Map([
  ["identity", "const identity = (x) => x;"],
  ["cons", "const cons = (head, rest) => [head, ...rest];"],
  ["car", "const car = (items) => items[0];"],
  ["cdr", "const cdr = (items) => items.slice(1);"],
  ["isNull", "const isNull = (items) => items.length === 0;"],
  ["fst", "const fst = (pair) => pair[0];"],
  ["snd", "const snd = (pair) => pair[1];"],
  ["not", "const not = (b) => !b;"],
  ["stringEq", "const stringEq = (a, b) => a === b;"],
  ["stringAppend", "const stringAppend = (a, b) => a + b;"],
  // Codepoints, not UTF-16 units: [...s] iterates by codepoint, so astral
  // characters count as one the way the F* kernel counts them.
  ["stringLength", "const stringLength = (s) => [...s].length;"],
  ["listLength", "const listLength = (items) => items.length;"],
  ["map", "const map = (f, items) => items.map((item) => f(item));"],
  ["filter", "const filter = (f, items) => items.filter((item) => f(item));"],
  // Wikifunctions' own order: Z876 is (function, iterable, initial object).
  ["fold", "const fold = (f, items, seed) => items.reduce((acc, item) => f(acc, item), seed);"],
  ["boolAnd", "const boolAnd = (a, b) => a && b;"],
  ["boolOr", "const boolOr = (a, b) => a || b;"],
  ["add1", "const add1 = (n) => n + 1;"],
  ["maxOf", "const maxOf = (a, b) => (a > b ? a : b);"],
  ["minOf", "const minOf = (a, b) => (a < b ? a : b);"],
  ["expt", "const expt = (base, power) => base ** power;"],
  ["list", "const list = (...items) => items;"],
  ["plus", "const plus = (a, b) => a + b;"],
  ["times", "const times = (a, b) => a * b;"],
  ["numEq", "const numEq = (a, b) => a === b;"],
  ["lessThan", "const lessThan = (a, b) => a < b;"],
  ["lessOrEqual", "const lessOrEqual = (a, b) => a <= b;"],
  ["greaterThan", "const greaterThan = (a, b) => a > b;"],
  ["greaterOrEqual", "const greaterOrEqual = (a, b) => a >= b;"],
  ["record", "const record = (type, fields) => ({ type, fields });"],
  ["Z10000", (n) => `export const ${n} = (a, b) => a + b;`],
  ["Z10008", 'export const Z10008_is_empty_string = (s) => s === "";'],
  ["Z10901", 'export const Z10901_get_first_character_of_string = (s) => [...s][0] ?? "";'],
  ["Z14456", (n) => `export const ${n} = (s) => [...s].slice(1).join(\"\");`],
  ["Z10615", (n) => `export const ${n} = (s, prefix) => s.startsWith(prefix);`],
  ["Z11040", (n) => `export const ${n} = (s) => [...s].length;`],
  ["Z866", (n) => `export const ${n} = (a, b) => a === b;`],
  ["Z13569", (n) => `export const ${n} = (a, b) => (a < b ? 0 : a - b);`],
  ["Z13582", (n) => `export const ${n} = (k) => (k === 0 ? 0 : k - 1);`],
  ["Z13546", (n) => `export const ${n} = (a, b) => {
  // Wikifunctions' own Python raises on a zero divisor rather than answering.
  if (b === 0) throw new Error("Z13546 divide natural numbers: division by zero");
  return Math.floor(a / b);
};`],
  ["Z12668", (n) => `export const ${n} = (items) => [...items].reverse();`],
  ["Z12961", (n) => `export const ${n} = (x, items) => [...items, x];`],
  ["Z22717", (n) => `export const ${n} = (s) => [...s].map((c) => c.codePointAt(0));`],
  ["Z22693", (n) => `export const ${n} = (cs) => cs.map((c) => String.fromCodePoint(c)).join(\"\");`],
  ["Z868", (n) => `export const ${n} = (s) => [...s].map((c) => c.codePointAt(0));`],
  ["Z886", (n) => `export const ${n} = (cs) => cs.map((c) => String.fromCodePoint(c)).join(\"\");`],
  ["Z13052", (n) => `export const ${n} = (a, b) =>
  JSON.stringify(a) === JSON.stringify(b);`],
  ["Z14520", (n) => `export const ${n} = (s, chars) => {
  const drop = new Set([...chars]);
  return [...s].filter((c) => !drop.has(c)).join("");
};`],
  ["Z14124", (n) => `export const ${n} = (first, last) => {
  let out = "";
  for (let code = first; code <= last; code += 1) out += String.fromCodePoint(code);
  return out;
};`],
  ["Z10075", (n) => `export const ${n} = (s, pattern, replacement) =>
  pattern === "" ? s : s.split(pattern).join(replacement);`],
  ["Z13318", (n) => `export const ${n} = (f, a, b) => f(a, b);`],
  ["Z21216", (n) => `export const ${n} = (f, a, b, c) => f(a, b, c);`],
  ["Z30438", (n) => `export const ${n} = (f, a, b, c, d) => f(a, b, c, d);`],
  ["Z14779", (n) => `export const ${n} = (f, xs, ys) =>
  xs.slice(0, Math.min(xs.length, ys.length)).map((x, i) => f(x, ys[i]));`],
  ["Z16829", (n) => `export const ${n} = (object) => object.type;`],
  ["Z803", (n) => `export const ${n} = (key, object) => object.fields[key];`],
  ["freshPrivateUseChar", `// The first private-use character not already in the input. Not a
// Wikifunctions function: the helper the generator emits for an idiom the
// corpus writes as a range scan.
const freshPrivateUseChar = (s) => {
  const used = new Set([...s]);
  for (let code = 60928; code <= 63487; code += 1) {
    const character = String.fromCodePoint(code);
    if (!used.has(character)) return character;
  }
  return "";
};`]
]);

// --- assembling --------------------------------------------------------------

function closureOf(zid, seen = new Set()) {
  if (seen.has(zid)) return seen;
  seen.add(zid);
  const text = sourceOf(zid);
  if (!text) return seen;
  for (const match of text.matchAll(/\b(Z[1-9][0-9]*)_/g)) {
    if (match[1] !== zid) closureOf(match[1], seen);
  }
  return seen;
}

function build(zids, lenient = false) {
  const wanted = new Set();
  for (const zid of zids) for (const reached of closureOf(zid)) wanted.add(reached);

  // Definitions first, in ZID order, then whatever prelude they turned out to
  // need. Order within the file does not matter for function declarations, and
  // const-bound arrows must precede use, so the prelude is emitted first.
  const used = new Set();
  const definitions = [];
  const unrenderable = [];
  for (const zid of [...wanted].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    if (!byZid.has(zid)) { used.add(zid); continue; }
    try {
      definitions.push(renderDefinition(zid, used));
    } catch (error) {
      // One body this renderer cannot express must not cost the other three
      // thousand. Recorded, and named in the module's own header.
      unrenderable.push(`${zid} ${byZid.get(zid).label}: ${error.message}`);
    }
  }

  const preludeParts = [];
  for (const [key, code] of PRELUDE) {
    if (!used.has(key)) continue;
    preludeParts.push(typeof code === "function" ? code(jsName(key)) : code);
  }
  const missing = [...used].filter((key) => !PRELUDE.has(key) && !byZid.has(key));
  if (missing.length) {
    if (!lenient) throw new Error(`no JavaScript for: ${missing.join(", ")}`);
    for (const key of missing) unrenderable.push(`primitive ${key} has no JavaScript`);
  }

  const asked = zids.length > 12
    ? [`${zids.length} functions`]
    : zids.map((zid) => `${zid} ${byZid.get(zid)?.label ?? ""}`.trim());
  const header = `// Wikifunctions, as a standalone JavaScript module.
//
// Generated by scripts/export-js.js. Do not edit.
//
// Exported: ${asked.join(", ")}
// Closure:  ${definitions.length} translated definitions, ${preludeParts.length} primitives.
${unrenderable.length ? `//\n// Not included, and why:\n${unrenderable.map((line) => `//   ${line}`).join("\n")}` : "//"}
//
// Each function body below is a mechanical translation of the s-expression that
// Wikifn.Print - a checked F* module - produces for the pinned composition, so
// the bodies say what the corpus says, with the revision and digest recorded
// above each one.
//
// The primitives are NOT extracted from F*. They are written in JavaScript,
// which is a second implementation of the same intent, exactly as
// scripts/export-scheme.js does for Scheme. Two implementations can disagree,
// so scripts/export-js.js --check runs this module and the F*-extracted engine
// over the same inputs and requires the same answers.
//
// Recursion here is JavaScript recursion: there is no fuel and no depth guard,
// so a composition that does not terminate will exhaust the stack rather than
// report a limit. The functions exported here are checked against their
// Wikifunctions testers; that is the guarantee, and it is not a proof.
`;

  // A short alias per function, so a caller can use the ZID alone. Skipped
  // where the name already is the bare ZID, which would be a duplicate export
  // and makes the whole module fail to load rather than that one name.
  const aliased = new Set();
  const aliases = zids
    .filter((zid) => {
      if (jsName(zid) === zid || aliased.has(zid)) return false;
      if (!definitions.some((d) => d.includes(`export function ${jsName(zid)}(`))) return false;
      aliased.add(zid);
      return true;
    })
    .map((zid) => `export { ${jsName(zid)} as ${zid} };`)
    .join("\n");

  return [header, preludeParts.join("\n\n"), definitions.join("\n\n"), aliases].join("\n\n") + "\n";
}

// --- checking against the extracted engine -----------------------------------

async function check(zids, moduleSource) {
  const dataUrl = "data:text/javascript;base64," + Buffer.from(moduleSource).toString("base64");
  const module = await import(dataUrl);
  const examples = require(path.join(root, "docs", "generated", "examples.json")).examples;

  let compared = 0;
  const disagreements = [];
  for (const zid of zids) {
    const cases = examples[zid] ?? [];
    if (cases.length === 0) {
      console.error(`  ${zid}: no tester examples, nothing to compare`);
      continue;
    }
    for (const sample of cases) {
      let fromEngine;
      try {
        const response = JSON.parse(
          globalThis.wikifnEngineCall(zid, "100000", JSON.stringify(sample.args)));
        fromEngine = response.ok
          ? (response.result.text ?? response.result.value ?? response.result)
          : `error: ${response.message}`;
      } catch (error) { fromEngine = `threw: ${error.message}`; }

      let fromModule;
      try {
        fromModule = module[zid](...sample.args);
      } catch (error) { fromModule = `threw: ${error.message}`; }

      compared += 1;
      const same = typeof fromEngine === "object"
        ? JSON.stringify(fromEngine) === JSON.stringify(fromModule)
        : String(fromEngine) === String(fromModule);
      if (!same) {
        disagreements.push(
          `${zid}(${JSON.stringify(sample.args)}): engine ${JSON.stringify(fromEngine)}, ` +
          `module ${JSON.stringify(fromModule)}`);
      }
    }
  }

  console.error(`checked ${compared} calls against the extracted engine`);
  for (const line of disagreements) console.error(`  DISAGREE ${line}`);
  return disagreements.length === 0;
}

const args = process.argv.slice(2);
let zids = args.filter((a) => /^Z[1-9][0-9]*$/.test(a));

// --all exports every runnable function in one module. Bigger than a targeted
// export and still far smaller than the extracted engine, because it carries no
// evaluator, no bignum runtime and no interpreter - just the bodies. It is
// plain ES module code, so a bundler can tree-shake it down to whatever is
// actually imported.
if (args.includes("--all")) {
  zids = catalogue.functions
    .filter((entry) => entry.runnable && !entry.reachesCycle)
    .map((entry) => entry.zid);
}
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;

if (zids.length === 0) {
  console.error("usage: node scripts/export-js.js ZID [ZID ...] [--out DIR] [--check]");
  process.exit(2);
}
for (const zid of zids) {
  if (!byZid.has(zid)) { console.error(`${zid} is not a translated composition`); process.exit(2); }
}

const source = build(zids, args.includes("--all"));

if (outDir) {
  await mkdir(path.resolve(root, outDir), { recursive: true });
  const nameIndex = args.indexOf("--name");
  const base = nameIndex >= 0 ? args[nameIndex + 1]
    : args.includes("--all") ? "wikifn-all"
    : zids.join("-");
  const file = path.resolve(root, outDir, `${base}.js`);
  await writeFile(file, source, "utf8");
  console.error(`${source.length} bytes -> ${file}`);
} else if (!args.includes("--check")) {
  process.stdout.write(source);
}

if (args.includes("--check")) {
  const agreed = await check(zids, source);
  if (!agreed) process.exit(1);
}

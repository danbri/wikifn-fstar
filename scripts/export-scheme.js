#!/usr/bin/env node
// Export a Wikifunctions function as a self-contained Scheme program.
//
// Takes the transitive closure of generated definitions, prepends a small
// prelude implementing the Wikifunctions primitives that have no native Scheme
// equivalent, and writes an R7RS program that any off-the-shelf Scheme can run.
//
//   node scripts/export-scheme.js Z34585 --call '(list) (list (list))'
//   node scripts/export-scheme.js --list-self-contained

import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = require(path.join(root, "docs", "generated", "functions.json"));

const byZid = new Map(catalog.functions.map((entry) => [entry.zid, entry]));

// Names the generated bodies use that a Scheme already has, or that the prelude
// below supplies. Anything outside this set makes a program not self-contained.
const NATIVE = new Set([
  "define", "if", "list", "cons", "car", "cdr", "null?", "not", "and", "or",
  "map", "filter", "fold", "identity", "length", "string-append", "string=?",
  "string-length", "<", "<=", "=", ">", ">=", "+", "*", "max", "min", "expt",
  "add1"
]);

// Wikifunctions primitives with no native equivalent. Only the ones a program
// actually uses are emitted.
const PRELUDE = new Map([
  ["Z10008_string_is_empty", `(define (Z10008_string_is_empty s) (string=? s ""))`],
  ["Z10901_first_character", `(define (Z10901_first_character s)
  (if (string=? s "") "" (substring s 0 1)))`],
  ["Z14456_remove_first_character", `(define (Z14456_remove_first_character s)
  (if (string=? s "") "" (substring s 1 (string-length s))))`],
  ["Z10615_string_starts_with", `(define (Z10615_string_starts_with s prefix)
  (let ((n (string-length prefix)))
    (and (>= (string-length s) n) (string=? (substring s 0 n) prefix))))`],
  ["Z11040_string_length", `(define (Z11040_string_length s) (string-length s))`],
  ["Z13569_subtract_natural_numbers_with_floor_of_0",
   `(define (Z13569_subtract_natural_numbers_with_floor_of_0 a b)
  (if (< a b) 0 (- a b)))`],
  ["Z13582_decrement_natural_number_by_one",
   `(define (Z13582_decrement_natural_number_by_one n) (if (= n 0) 0 (- n 1)))`],
  ["Z14520_remove_all_characters_in_second_string",
   `(define (Z14520_remove_all_characters_in_second_string s chars)
  (list->string
    (filter (lambda (c) (not (memv c (string->list chars)))) (string->list s))))`],
  ["Z14124_string_of_characters_from_unicode_range",
   `(define (Z14124_string_of_characters_from_unicode_range first last)
  (let loop ((i first) (acc '()))
    (if (> i last)
        (list->string (reverse acc))
        (loop (+ i 1) (cons (integer->char i) acc)))))`],
  ["Z10075_replace_all_substrings",
   `(define (Z10075_replace_all_substrings s pattern replacement)
  (if (string=? pattern "")
      s
      (let ((n (string-length s)) (m (string-length pattern)))
        (let loop ((i 0) (acc ""))
          (cond ((> (+ i m) n)
                 (string-append acc (substring s i n)))
                ((string=? (substring s i (+ i m)) pattern)
                 (loop (+ i m) (string-append acc replacement)))
                (else
                 (loop (+ i 1) (string-append acc (substring s i (+ i 1)))))))))) `]
]);

// Shims for names not in R7RS-small, so the output runs unmodified anywhere.
const SHIMS = `(define (identity x) x)

(define (add1 n) (+ n 1))

(define (fold f seed items)
  (if (null? items) seed (fold f (f seed (car items)) (cdr items))))
`;

const HAS_FILTER_SHIM = `(define (filter pred items)
  (cond ((null? items) '())
        ((pred (car items)) (cons (car items) (filter pred (cdr items))))
        (else (filter pred (cdr items)))))
`;

function referencedZids(entry) {
  return [...new Set([...entry.sexpr.matchAll(/\b(Z[1-9][0-9]*)_[A-Za-z0-9_]*/g)].map((m) => m[0]))];
}

function closureOf(zid, seen = new Set()) {
  if (seen.has(zid)) return seen;
  const entry = byZid.get(zid);
  if (!entry) return seen;
  seen.add(zid);
  for (const name of referencedZids(entry)) {
    const target = name.split("_")[0];
    if (target !== zid) closureOf(target, seen);
  }
  return seen;
}

// Every bare name a program mentions, so unresolved ones can be reported.
function namesUsed(zids) {
  const names = new Set();
  for (const zid of zids) {
    // Strip string literals first: their contents are data, not identifiers.
    const body = byZid.get(zid).sexpr.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const match of body.matchAll(/[('\s]([A-Za-z_][^\s()"]*|[<>=+*]+\??)/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

function analyse(zid) {
  const zids = [...closureOf(zid)];
  const defined = new Set(zids.map((z) => byZid.get(z).name));
  const used = namesUsed(zids);
  const unresolved = [];
  const preludeNeeded = new Set();
  for (const name of used) {
    if (NATIVE.has(name) || defined.has(name)) continue;
    if (PRELUDE.has(name)) { preludeNeeded.add(name); continue; }
    if (/^a\d+$/.test(name)) continue; // argument placeholders
    unresolved.push(name);
  }
  return { zids, preludeNeeded: [...preludeNeeded].sort(), unresolved: [...new Set(unresolved)].sort() };
}

function emit(zid, callExpr) {
  const { zids, preludeNeeded, unresolved } = analyse(zid);
  if (unresolved.length > 0) {
    throw new Error(`${zid} is not self-contained; unresolved: ${unresolved.join(", ")}`);
  }
  const entry = byZid.get(zid);

  // Dependencies first, so the program loads top to bottom in any Scheme.
  const order = [];
  const placed = new Set();
  const place = (z) => {
    if (placed.has(z)) return;
    placed.add(z);
    for (const name of referencedZids(byZid.get(z))) {
      const target = name.split("_")[0];
      if (target !== z && byZid.has(target)) place(target);
    }
    order.push(z);
  };
  place(zid);

  const usesFilter = order.some((z) => /\(filter\b/.test(byZid.get(z).sexpr)) ||
    preludeNeeded.some((name) => /\(filter\b/.test(PRELUDE.get(name)));

  const lines = [
    `;; ${entry.zid} ${entry.label}`,
    ";;",
    ";; A self-contained Scheme program, exported from pinned Wikifunctions data.",
    `;; ${order.length} generated definitions and ${preludeNeeded.length} prelude primitives.`,
    ";;",
    ";; Everything below the prelude is a mechanical translation of a pinned",
    ";; Z14K2 composition. Names are the ZID followed by the English label, so",
    ";; the first token maps back to the wiki identifier.",
    ";;",
    ";; Run with any R7RS Scheme, for example:",
    ";;   chez --script this-file.scm",
    ";;   guile this-file.scm",
    "",
    ";; ---- prelude: Wikifunctions primitives with no native equivalent ----",
    "",
    SHIMS
  ];
  if (usesFilter) lines.push(HAS_FILTER_SHIM);
  for (const name of preludeNeeded) lines.push(PRELUDE.get(name), "");

  lines.push(";; ---- generated definitions ----", "");
  for (const z of order) {
    const e = byZid.get(z);
    lines.push(`;; ${e.zid} ${e.label}`);
    lines.push(e.sexpr);
    lines.push("");
  }

  if (callExpr) {
    lines.push(";; ---- run ----", "");
    lines.push(`(display (${entry.name} ${callExpr}))`);
    lines.push("(newline)");
  }
  return lines.join("\n");
}

function listSelfContained() {
  const rows = [];
  for (const entry of catalog.functions) {
    try {
      const { zids, preludeNeeded, unresolved } = analyse(entry.zid);
      if (unresolved.length === 0) {
        rows.push({ zid: entry.zid, label: entry.label, defs: zids.length, prelude: preludeNeeded.length });
      }
    } catch {
      // analyse only throws on malformed entries; skip them
    }
  }
  rows.sort((a, b) => b.defs - a.defs);
  console.log(`${rows.length} of ${catalog.functions.length} functions are fully self-contained\n`);
  console.log("largest, by number of definitions:");
  for (const row of rows.slice(0, 20)) {
    console.log(`  ${row.zid.padEnd(9)} ${String(row.defs).padStart(3)} defs  ${String(row.prelude).padStart(2)} prelude  ${row.label}`);
  }
}

const args = process.argv.slice(2);
if (args.includes("--list-self-contained")) {
  listSelfContained();
} else {
  const zid = args.find((a) => /^Z[1-9][0-9]*$/.test(a));
  if (!zid) {
    console.error("usage: export-scheme.js <ZID> [--call '<scheme args>'] [--out FILE]");
    process.exit(2);
  }
  const callIndex = args.indexOf("--call");
  const outIndex = args.indexOf("--out");
  const program = emit(zid, callIndex >= 0 ? args[callIndex + 1] : undefined);
  if (outIndex >= 0) await writeFile(args[outIndex + 1], program, "utf8");
  else console.log(program);
}

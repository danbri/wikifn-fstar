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

// Sources come from Wikifn.Print, the checked F* module the evaluator uses, so
// an exported program and a running one can never disagree about what a
// composition says.
require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));
const nameTable = JSON.stringify(catalog.names || {});
const sourceCache = new Map();

function sourceOf(zid) {
  if (sourceCache.has(zid)) return sourceCache.get(zid);
  const entry = byZid.get(zid);
  let text = "";
  if (entry) {
    const rendered = JSON.parse(
      globalThis.wikifnEngineSource(zid, String(entry.arity), nameTable));
    text = rendered.ok ? rendered.source : "";
  }
  sourceCache.set(zid, text);
  return text;
}

// Names the generated bodies use that a Scheme already has, or that the prelude
// below supplies. Anything outside this set makes a program not self-contained.
const NATIVE = new Set([
  "define", "if", "list", "cons", "car", "cdr", "null?", "not", "and", "or",
  "map", "filter", "fold", "identity", "length", "string-append", "string=?",
  "string-length", "<", "<=", "=", ">", ">=", "+", "*", "max", "min", "expt",
  "add1"
]);
// bool-and and bool-or come from the prelude, not from Scheme.

// Wikifunctions primitives with no native Scheme equivalent, keyed by ZID and
// parameterised by the name the printer chose, so a label change cannot break
// the mapping. Only the ones a program actually uses are emitted.
export const PRELUDE = new Map([
  ["Z10008", (n) => `(define (${n} s) (string=? s ""))`],
  ["Z10901", (n) => `(define (${n} s)\n  (if (string=? s "") "" (substring s 0 1)))`],
  ["Z14456", (n) => `(define (${n} s)\n  (if (string=? s "") "" (substring s 1 (string-length s))))`],
  // Written with nested if rather than and, so nothing in the generated files
  // relies on a syntactic keyword at all. Some Scheme editors object to any
  // mention of one.
  ["Z10615", (n) => `(define (${n} s prefix)\n  (let ((k (string-length prefix)))\n    (if (>= (string-length s) k)\n        (string=? (substring s 0 k) prefix)\n        #f)))`],
  ["Z11040", (n) => `(define (${n} s) (string-length s))`],
  ["Z10000", (n) => `(define (${n} a b) (string-append a b))`],
  ["Z10174", (n) => `;; Strict, unlike Scheme's and: Z10174 is a function, so both\n;; arguments are evaluated.\n(define (${n} a b) (if a (if b #t #f) #f))`],
  ["Z10184", (n) => `(define (${n} a b) (if a #t (if b #t #f)))`],
  ["Z866", (n) => `(define (${n} a b) (string=? a b))`],
  // Structural equality over any two values, grounded for the same reason:
  // Z13052 is written as apply(self, a, b) and never bottoms out.
  ["Z13052", (n) => `(define (${n} a b) (equal? a b))`],
  // Z29294 object equivalence: three code implementations on the wiki and no
  // composition, and its Python is a structural comparison.
  ["Z29294", (n) => `(define (${n} a b) (equal? a b))`],
  // R7RS string-downcase and string-upcase are specified as full Unicode
  // case mapping with final-sigma handling, so these are correct - but they
  // delegate the claim to the host Scheme's tables rather than restating the
  // verified one, which is a different oracle from the F* module.
  ["Z10047", (n) => `(define (${n} s) (string-downcase s))`],
  ["Z10018", (n) => `(define (${n} s) (string-upcase s))`],
  // A type is a value: a plain one is its identifier, a generic one is a record
  // of its identifier and parameters, printed the way Z22764's testers spell it.
  ["Z881", (n) => `(define (${n} a) (list 'record 'Z881 (list 'Z881K1 a)))`],
  ["Z882", (n) => `(define (${n} a b) (list 'record 'Z882 (list 'Z882K1 a) (list 'Z882K2 b)))`],
  ["Z883", (n) => `(define (${n} a b) (list 'record 'Z883 (list 'Z883K1 a) (list 'Z883K2 b)))`],
  ["Z22764", (n) => `(define (${n} t)\n  (if (pair? t)\n      (string-append (symbol->string (cadr t)) " ("\n        (apply string-append\n          (let loop ((f (cddr t)))\n            (cond ((null? f) (list))\n                  ((null? (cdr f)) (list (${n} (cadr (car f)))))\n                  (else (cons (${n} (cadr (car f))) (cons ", " (loop (cdr f))))))))\n        ")")\n      (symbol->string t)))`],
  // A Z882 pair prints as (cons left right), so its accessors are car and cdr.
  // These were used by the listing and defined nowhere, which made every body
  // mentioning a pair fail to run.
  ["Z821", (n) => `(define (${n} p) (car p))`],
  ["Z822", (n) => `(define (${n} p) (cdr p))`],
  ["Z13569", (n) => `(define (${n} a b) (if (< a b) 0 (- a b)))`],
  ["Z13582", (n) => `(define (${n} k) (if (= k 0) 0 (- k 1)))`],
  // Reverse and append are primitives here for the same reason they are in the
  // F* evaluator: the corpus defines them through each other with no base case.
  ["Z12668", (n) => `(define (${n} items) (reverse items))`],
  ["Z12961", (n) => `;; Element first, list second - the order Z12961 declares.\n(define (${n} x items) (append items (list x)))`],
  ["Z22717", (n) => `(define (${n} s) (map char->integer (string->list s)))`],
  // Z868 is Z22717 under a name the wiki marks deprecated.
  ["Z868", (n) => `(define (${n} s) (map char->integer (string->list s)))`],
  // Z886 is Z22693 the same way.
  ["Z886", (n) => `(define (${n} cs) (list->string (map integer->char cs)))`],
  // Floor division. Wikifunctions' own Python raises on a zero divisor rather
  // than answering, so this does too.
  // Two arguments to error, not one: R7RS wants a message and irritants, and a
  // one-argument call makes Chez warn about the arity.
  ["Z13546", (n) => `(define (${n} a b)\n  (if (= b 0)\n      (error "Z13546 divide natural numbers" "division by zero")\n      (quotient a b)))`],
  ["Z22693", (n) => `(define (${n} cs) (list->string (map integer->char cs)))`],
  ["Z14520", (n) => `(define (${n} s chars)\n  (list->string\n    (filter (lambda (c) (not (memv c (string->list chars)))) (string->list s))))`],
  ["Z14124", (n) => `(define (${n} first last)\n  (let loop ((i first) (acc '()))\n    (if (> i last)\n        (list->string (reverse acc))\n        (loop (+ i 1) (cons (integer->char i) acc)))))`],
  ["Z10075", (n) => `(define (${n} s pattern replacement)\n  (if (string=? pattern "")\n      s\n      (let ((len (string-length s)) (m (string-length pattern)))\n        (let loop ((i 0) (acc ""))\n          (cond ((> (+ i m) len) (string-append acc (substring s i len)))\n                ((string=? (substring s i (+ i m)) pattern)\n                 (loop (+ i m) (string-append acc replacement)))\n                (else (loop (+ i 1) (string-append acc (substring s i (+ i 1))))))))))`],
  // Applying a function value. In Scheme a function value is just a procedure,
  // so these are one line each; they exist because Wikifunctions spells
  // application as a function call rather than as syntax.
  ["Z13318", (n) => `(define (${n} f a b) (f a b))`],
  ["Z21216", (n) => `(define (${n} f a b c) (f a b c))`],
  ["Z30438", (n) => `(define (${n} f a b c d) (f a b c d))`],
  // Stops at the shorter list, as the evaluator does, rather than erroring.
  // Nested if rather than or, so nothing here relies on a syntactic keyword.
  ["Z14779", (n) => `(define (${n} f xs ys)\n  (if (null? xs)\n      '()\n      (if (null? ys)\n          '()\n          (cons (f (car xs) (car ys)) (${n} f (cdr xs) (cdr ys))))))`],
  // A record prints as (record TYPE (KEY value) ...). record and the key names
  // are procedures rather than quoted data, so the printed form stays a plain
  // s-expression that a Scheme can read and evaluate.
  ["Z16829", (n) => `;; A record is (record TYPE (KEY value) ...); its type is the second item.\n(define (${n} object) (cadr object))`],
  ["Z803", (n) => `(define (${n} key object)\n  (let loop ((fields (cddr object)))\n    (cond ((null? fields) #f)\n          ((eq? (car (car fields)) key) (car (cdr (car fields))))\n          (else (loop (cdr fields))))))`],
  // Errors as values. A Wikifunctions error is a record carrying its errortype
  // and parameters; raising one is a Scheme error carrying that record, and
  // catching is a guard on it. Written with the R7RS exception system, which
  // every Scheme this listing targets has.
  ["Z851", (n) => `(define (${n} errortype parameters)\n  (raise (list 'wikifn-error errortype parameters)))`],
  ["Z853", (n) => `(define (${n} thunk)\n  ;; Whether a call threw, and what. The argument is a value here rather\n  ;; than a computation, so a caller that wants the lazy form writes\n  ;; (${n} (guard ...)) itself - Scheme has no way to un-evaluate it.\n  (list #f thunk))`],
  ["Z850", (n) => `(define (${n} attempted errortype handler)\n  ;; Strict, unlike the evaluator's form: by the time this is called the\n  ;; attempt has already been made. wikifn-hints.scm has a macro form that\n  ;; keeps the handler lazy.\n  attempted)`],
  ["Z1000000001", (n) => `;; The first private-use character not already in the input. Not a\n;; Wikifunctions function: the helper the generator emits for an idiom the\n;; corpus writes as a range scan.\n(define (${n} s)\n  (let ((used (string->list s)))\n    (let loop ((code 60928))\n      (cond ((> code 63487) "")\n            ((memv (integer->char code) used) (loop (+ code 1)))\n            (else (string (integer->char code)))))))`]
]);

// The name the printer uses for each prelude primitive.
export const preludeNames = new Map();
for (const zid of PRELUDE.keys()) {
  const classical = {
    Z1000000001: "fresh-private-use-char",
    Z10174: "bool-and", Z10184: "bool-or",
    Z821: "fst", Z822: "snd"
  };
  const name = classical[zid] || (catalog.names || {})[zid] || zid;
  preludeNames.set(name, zid);
}

// Shims for names not in R7RS-small, so the output runs unmodified anywhere.
export const SHIMS = `;; A record prints as (record TYPE (KEY value) ...) - a Wikidata reference,
;; a monolingual string, a rational. The type and the keys are names, not
;; values, so this quotes them and evaluates only the values. That keeps the
;; printed form a plain s-expression a Scheme can read.
(define-syntax record
  (syntax-rules ()
    ((_ type (key value) ...) (list 'record 'type (list 'key value) ...))))

(define (identity x) x)

(define (add1 n) (+ n 1))

;; Argument order is Wikifunctions' own, not SRFI-1's: Z876 declares
;; Z876K1 function, Z876K2 iterable, Z876K3 initial object, so the list comes
;; second and the seed third. Written the SRFI way this silently folded over
;; the wrong argument and handed the combining function an element where a
;; list was wanted.
(define (fold f items seed)
  (if (null? items) seed (fold f (cdr items) (f seed (car items)))))
`;

export const HAS_FILTER_SHIM = `(define (filter pred items)
  (cond ((null? items) '())
        ((pred (car items)) (cons (car items) (filter pred (cdr items))))
        (else (filter pred (cdr items)))))
`;

function referencedZids(entry) {
  return [...new Set([...sourceOf(entry.zid).matchAll(/\b(Z[1-9][0-9]*)_[A-Za-z0-9_]*/g)].map((m) => m[0]))];
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
    const body = sourceOf(zid).replace(/"(?:[^"\\]|\\.)*"/g, '""');
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
    if (preludeNames.has(name)) { preludeNeeded.add(name); continue; }
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

  const usesFilter = order.some((z) => /\(filter\b/.test(sourceOf(z))) ||
    preludeNeeded.some((name) => /\(filter\b/.test(PRELUDE.get(preludeNames.get(name))(name)));

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
  for (const name of preludeNeeded) {
    lines.push(PRELUDE.get(preludeNames.get(name))(name), "");
  }

  lines.push(";; ---- generated definitions ----", "");
  for (const z of order) {
    const e = byZid.get(z);
    lines.push(`;; ${e.zid} ${e.label}`);
    lines.push(sourceOf(e.zid));
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

// CLI only when run directly, so the prelude tables can be imported.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
}

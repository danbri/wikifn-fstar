import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const listing = path.resolve("docs/generated/wikifn.scm");
const prelude = path.resolve("docs/generated/wikifn-prelude.scm");
const skip = existsSync(listing) && existsSync(prelude)
  ? false
  : "run make fstar-engine first";

// Scheme's syntactic keywords are not procedures. A bare mention of one in
// value position is a syntax error, and it takes the whole file down rather
// than failing locally. The corpus reaches this: Z13651 bitwise and passes
// Z10174 to a higher-order function.
const KEYWORDS = new Set([
  "and", "or", "if", "define", "lambda", "let", "let*", "letrec", "cond",
  "case", "begin", "quote", "quasiquote", "unquote", "set!", "do", "delay",
  "define-syntax", "syntax-rules", "when", "unless"
]);

// Tokens outside comments and string literals, paired with whether each is the
// head of its list.
function tokensWithPosition(source) {
  let stripped = "";
  let inString = false;
  let inComment = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (inComment) {
      if (c === "\n") { inComment = false; stripped += "\n"; }
      continue;
    }
    if (inString) {
      if (c === "\\") { i += 1; continue; }
      if (c === '"') { inString = false; stripped += " "; }
      continue;
    }
    if (c === ";") { inComment = true; continue; }
    if (c === '"') { inString = true; continue; }
    stripped += c;
  }
  const tokens = stripped.replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(Boolean);
  const result = [];
  let expectHead = false;
  for (const token of tokens) {
    if (token === "(") { expectHead = true; continue; }
    if (token === ")") { expectHead = false; continue; }
    result.push({ token, head: expectHead });
    expectHead = false;
  }
  return result;
}

test("no syntactic keyword appears in value position", { skip }, () => {
  const offenders = tokensWithPosition(readFileSync(listing, "utf8"))
    .filter((entry) => !entry.head && KEYWORDS.has(entry.token))
    .map((entry) => entry.token);
  assert.deepEqual(
    [...new Set(offenders)],
    [],
    `${offenders.length} keywords used as values; they must be wrapped in a lambda`
  );
});

test("parentheses balance across the whole listing", { skip }, () => {
  const source = readFileSync(listing, "utf8");
  let depth = 0;
  let inString = false;
  let inComment = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (inComment) { if (c === "\n") inComment = false; continue; }
    if (inString) { if (c === "\\") { i += 1; continue; } if (c === '"') inString = false; continue; }
    if (c === ";") { inComment = true; continue; }
    if (c === '"') { inString = true; continue; }
    if (c === "(") depth += 1;
    if (c === ")") depth -= 1;
    assert.ok(depth >= 0, `unbalanced close parenthesis at offset ${i}`);
  }
  assert.equal(depth, 0, "listing does not close every parenthesis");
});

// Some Scheme editors object to any mention of a syntactic keyword, not only
// to one in value position, so the generated files avoid and/or entirely.
// Z10174 and Z10184 are Wikifunctions functions rather than short-circuit
// syntax, so plain strict procedures are the faithful rendering anyway.
test("the generated files never mention and or or", { skip }, () => {
  for (const file of [listing, prelude, path.resolve("docs/generated/wikifn-bundle.scm")]) {
    if (!existsSync(file)) continue;
    const mentions = tokensWithPosition(readFileSync(file, "utf8"))
      .filter((entry) => entry.token === "and" || entry.token === "or");
    assert.equal(mentions.length, 0, `${path.basename(file)} mentions ${mentions[0]?.token}`);
  }
});

test("the bundle loads its prelude before anything that needs it", { skip }, () => {
  const bundlePath = path.resolve("docs/generated/wikifn-bundle.scm");
  if (!existsSync(bundlePath)) return;
  const source = readFileSync(bundlePath, "utf8");
  const preludeMark = source.indexOf("(define (identity x) x)");
  const firstGenerated = source.search(/\(define \(Z[1-9][0-9]*_/);
  assert.ok(preludeMark >= 0, "bundle has no prelude");
  assert.ok(preludeMark < firstGenerated, "bundle defines a composition before the prelude");
});

test("the prelude defines every primitive the listing needs", { skip }, () => {
  const preludeSource = readFileSync(prelude, "utf8");
  const defined = new Set(
    [...preludeSource.matchAll(/\(define\s+\(([^\s)]+)/g)].map((m) => m[1])
  );
  // Primitive names are those the listing calls but never defines.
  const listingSource = readFileSync(listing, "utf8");
  const definedInListing = new Set(
    [...listingSource.matchAll(/\(define\s+\(([^\s)]+)/g)].map((m) => m[1])
  );
  const called = new Set(
    tokensWithPosition(listingSource).filter((e) => e.head).map((e) => e.token)
  );
  const missing = [...called].filter((name) =>
    /^Z[1-9][0-9]*_/.test(name) && !definedInListing.has(name) && !defined.has(name));
  assert.deepEqual(missing.slice(0, 8), [], `${missing.length} primitives are neither defined nor in the prelude`);
});

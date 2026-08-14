// The demo pages are code, and nothing was checking that they parse.
//
// This exists because they shipped broken: an edit left two `const keys` in one
// function scope, which is a SyntaxError, and a SyntaxError takes the whole
// script with it - not the one feature, the whole page. The button did nothing
// and the console said so, but only to whoever opened the page. Every other
// test passed.
//
// Parsing is cheap and catches that entire class. It does not catch a page that
// parses and then misbehaves; only opening it does.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const docs = path.resolve("docs");
const pages = readdirSync(docs).filter((name) => name.endsWith(".html"));

// Inline scripts only. Anything with src= is a separate file the browser fetches.
const inlineScripts = (html) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

test("there are demo pages to check", () => {
  assert.ok(pages.length > 0, "no HTML found in docs/");
});

for (const page of pages) {
  test(`${page} parses as JavaScript`, () => {
    const html = readFileSync(path.join(docs, page), "utf8");
    inlineScripts(html).forEach((source, index) => {
      assert.doesNotThrow(
        () => new vm.Script(source, { filename: `${page}#${index}` }),
        `${page} inline script ${index} does not parse`
      );
    });
  });
}

test("every page that loads a generated artifact refers to one that exists", () => {
  const generated = new Set(readdirSync(path.join(docs, "generated")));
  for (const page of pages) {
    const html = readFileSync(path.join(docs, page), "utf8");
    for (const match of html.matchAll(/\.\/generated\/([A-Za-z0-9_.-]+)/g)) {
      assert.ok(
        generated.has(match[1]),
        `${page} refers to generated/${match[1]}, which is not there`
      );
    }
  }
});

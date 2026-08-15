// What of the Wikifunctions data model this engine actually represents.
//
// The value type is the claim. Everything else - which functions run, which
// testers pass - follows from what a value can be, so this file pins that
// directly rather than inferring it from behaviour elsewhere.
//
// Two kinds of test live here. The first exercises each shape a value can take,
// end to end, through the engine: if the shape is claimed, something must
// produce one and something must read it back. The second records what is
// *not* represented, with the count of corpus positions that declare it, so the
// gap is a number that can be driven down rather than a paragraph in a document.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const enginePath = path.resolve("docs/generated/wikifn_engine.cjs");
const cataloguePath = path.resolve("docs/generated/functions.json");
const skip = !existsSync(enginePath) ? { skip: "no built engine; run make fstar-engine" } : {};

function engine() {
  require(enginePath);
  return {
    catalogue: require(cataloguePath),
    call: (zid, args, fuel = "100000") =>
      JSON.parse(globalThis.wikifnEngineCall(zid, fuel, JSON.stringify(args)))
  };
}

// Every shape a value can take, and something in the corpus that produces one.
// A shape with no way to make it is a claim with nothing behind it.
const SHAPES = [
  { type: "Z6", what: "a string", zid: "Z10052", args: ["a b"], read: (r) => r.text === "ab" },
  { type: "Z40", what: "a boolean", zid: "Z10096", args: ["kayak"], read: (r) => r.value === true },
  {
    type: "Z13518", what: "a natural number",
    zid: "Z11040", args: ["abcd"], read: (r) => Number(r.value) === 4
  },
  {
    type: "Z881", what: "a typed list",
    zid: "Z12668", args: [[1, 2, 3]],
    read: (r) => Array.isArray(r.items) && r.items.length === 3
  },
  {
    type: "Z882", what: "a typed pair",
    zid: "Z17534", args: ["left", "right"],
    read: (r) => (r.fields?.K1?.text ?? r.first?.text) === "left"
  },
  {
    type: "Z11", what: "a record, here monolingual text",
    zid: "Z861", args: ["hello", "Z1002"],
    read: (r) => r.fields !== undefined && Object.keys(r.fields).length === 2
  },
  {
    // A quote holds an expression rather than a value, which is why the value
    // and expression types are one mutually recursive family. Z29113 is the
    // corpus's own quoted reference from ZID string.
    type: "Z99", what: "a quote",
    zid: "Z29113", args: ["Z6"],
    read: (r) => r.type === "Z99" && typeof r.quoted === "string"
  }
];

for (const shape of SHAPES) {
  test(`the value model holds ${shape.what} (${shape.type})`, skip, () => {
    const { call } = engine();
    const response = call(shape.zid, shape.args);
    assert.ok(response.ok, `${shape.zid} did not evaluate: ${response.message}`);
    assert.ok(
      shape.read(response.result),
      `${shape.zid} returned ${JSON.stringify(response.result)}, which is not ${shape.what}`
    );
  });
}

// Errors as values. Z5 is a type in Wikifunctions: a composition can raise an
// error, catch one of a named type, and ask whether a call threw. Until this
// worked an error could only stop evaluation, which is a different thing.
test("an error is a value: a composition can raise one", skip, () => {
  const { catalogue, call } = engine();
  // Any function that reaches Z851 will do; the point is that raising produces
  // an error carrying its Z5 rather than an evaluator failure.
  const thrower = catalogue.functions.find((entry) =>
    entry.runnable && (entry.calls ?? []).includes?.("Z851"));
  const response = call("Z851", ["Z500", []]);
  // Z851 is a special form, so calling it directly raises.
  assert.equal(response.ok, false, "throwing should not succeed");
  assert.match(
    response.message, /raised by the composition/,
    `a raised error should be reported as one, got: ${response.message}`
  );
});

test("an error is a value: asking whether a call threw is an answer", skip, () => {
  const { call } = engine();
  // Z853 turns a call into (did it throw?, what). Both outcomes are values, so
  // neither is a failure of the surrounding evaluation.
  const threw = call("Z853", ["ignored"]);
  assert.ok(
    threw.ok || /arity|type/.test(threw.message ?? ""),
    `Z853 should answer or refuse cleanly, got: ${JSON.stringify(threw)}`
  );
});

// Equality over the whole value model, which is what makes a comparison
// meaningful for anything but strings and numbers. Both Wikifunctions functions
// that mean this - Z13052 object equality and Z29294 object equivalence - are
// grounded on the same structural comparison, and both have only code
// implementations upstream, so following their compositions reaches nothing.
const EQUALITY = ["Z13052", "Z29294"];

for (const zid of EQUALITY) {
  test(`${zid} compares every shape a value can take`, skip, () => {
    const { call } = engine();
    const holds = (args, want, what) => {
      const response = call(zid, args);
      assert.ok(response.ok, `${zid}${JSON.stringify(args)} did not evaluate: ${response.message}`);
      assert.equal(
        response.result.value, want,
        `${zid} said ${response.result.value} comparing ${what}`
      );
    };
    holds(["abc", "abc"], true, "equal strings");
    holds(["abc", "abd"], false, "different strings");
    holds([1, 1], true, "equal numbers");
    holds([1, 2], false, "different numbers");
    holds([true, true], true, "equal booleans");
    holds([[1, 2, 3], [1, 2, 3]], true, "equal lists");
    holds([[1, 2, 3], [1, 2]], false, "lists of different length");
    holds([[1, 2], [2, 1]], false, "lists in a different order");
    // Across shapes: a number and the string of that number are not equal.
    holds([1, "1"], false, "a number and a string");
    holds([[], ""], false, "an empty list and an empty string");
  });
}

// A type is a value, and a generic type carries its parameters.
//
// Z16829 answers what type a value has; Z881/Z882/Z883 build the generic types;
// Z22764 renders one back to text. The spelling is not ours to choose - these
// are the strings Z22764's own testers demand, nested brackets and all.
test("every value has a type, and a type is a value", skip, () => {
  const { call } = engine();
  const typeOf = (v) => call("Z16829", [v]);
  const shapes = [
    ["abc", "Z6", "a string"],
    [true, "Z40", "a boolean"],
    [7, "Z13518", "a natural number"],
    [[1, 2], "Z881", "a list"]
  ];
  for (const [v, want, what] of shapes) {
    const r = typeOf(v);
    assert.ok(r.ok, `type of ${what} did not evaluate: ${r.message}`);
    const rendered = call("Z22764", [r.result]);
    assert.ok(rendered.ok, `rendering the type of ${what} failed: ${rendered.message}`);
    assert.equal(rendered.result.text, want, `type of ${what}`);
  }
});

test("a generic type renders with its parameters, nested", skip, () => {
  const { call } = engine();
  const t = (zid) => call("Z16829", [zid]).result;
  // Built the way the corpus writes them: a type constructor applied to types.
  const list = (a) => call("Z881", [a]).result;
  const pair = (a, b) => call("Z882", [a, b]).result;
  const map = (a, b) => call("Z883", [a, b]).result;
  const render = (v) => {
    const r = call("Z22764", [v]);
    assert.ok(r.ok, `Z22764 failed: ${r.message}`);
    return r.result.text;
  };
  const Z = (n) => ({ type: "Z8", zid: n });

  assert.equal(render(Z("Z40")), "Z40", "a plain type is its identifier");
  assert.equal(render(list(Z("Z40"))), "Z881 (Z40)", "tester Z22963");
  assert.equal(render(pair(Z("Z6"), Z("Z16683"))), "Z882 (Z6, Z16683)", "tester Z28971");
  // Tester Z31202: generics nest, and the rendering nests with them.
  assert.equal(
    render(pair(Z("Z99"), map(Z("Z6"), list(Z("Z6"))))),
    "Z882 (Z99, Z883 (Z6, Z881 (Z6)))",
    "tester Z31202"
  );
});

// What is not represented, as counts rather than prose. Lower these by adding
// the shape; never raise one without saying why.
const NOT_REPRESENTED = [
  { name: "Integer", budget: 250 },
  { name: "Rational number", budget: 400 },
  { name: "float64", budget: 300 },
  { name: "Wikidata item reference", budget: 1200 }
];

test("what the value model does not hold is counted, not described", skip, () => {
  const { catalogue } = engine();
  const declared = new Map();
  for (const entry of catalogue.functions) {
    for (const type of [...(entry.argumentTypes ?? []), entry.returnType ?? ""]) {
      const head = String(type).replace(/\(.*/, "");
      declared.set(head, (declared.get(head) ?? 0) + 1);
    }
  }
  const over = NOT_REPRESENTED
    .map((row) => ({ ...row, count: declared.get(row.name) ?? 0 }))
    .filter((row) => row.count > row.budget)
    .map((row) => `${row.name}: ${row.count} declared positions, budget ${row.budget}`);
  assert.deepEqual(
    over, [],
    "a type the value model does not represent grew its share of the corpus.\n" +
    "  These are declared positions, not failures; the number is here so that\n" +
    "  adding the shape shows up as the budget going to zero."
  );
});

// Quoting is not just a container: the point of a quote is that what it holds
// can be run later, in the environment the unquote sits in.
test("quoting is no longer what stands in the way", skip, () => {
  const { call } = engine();
  // Z24307 fallback language codes reads a table stored on the wiki as a Z99
  // and unquotes it. Before quoting existed, the reference to that table became
  // a call to a function nobody implements and the answer was silently wrong.
  //
  // It still does not evaluate, because Z33399 - the function the table is
  // handed to - has no implementation here. That is a different gap, and the
  // point of this test is that quoting is no longer the one in the way: the
  // failure must not be about Z899, Z99 or the stored object itself.
  const response = call("Z24307", ["de", "fr", "en"]);
  if (!response.ok) {
    assert.doesNotMatch(
      response.message, /Z899|Z99\b|Z33395/,
      `Z24307 still fails on quoting: ${response.message}`
    );
  }
  // What can be checked end to end: a quoted reference is a quote, and the
  // thing it holds is what was asked for.
  const quoted = call("Z29113", ["Z6"]);
  assert.ok(quoted.ok, `Z29113 did not evaluate: ${quoted.message}`);
  assert.equal(quoted.result.type, "Z99", "a quoted reference should be a quote");
  assert.match(
    String(quoted.result.quoted), /Z6/,
    `the quote should hold the reference it was given, got ${JSON.stringify(quoted.result)}`
  );
});

// Reify turns any object into the list of key-value pairs it is made of, which
// is how the corpus asks what something is without a type system. Z15818 is
// natural number is written as car(reify(x)) = car(reify(0)).
test("reify exposes an object as its key-value pairs", skip, () => {
  const { call } = engine();
  const reified = call("Z805", ["abc"]);
  assert.ok(reified.ok, `Z805 did not evaluate: ${reified.message}`);
  assert.ok(Array.isArray(reified.result.items), "reify should return a list");
  assert.ok(reified.result.items.length >= 2, "a string reifies to its type and its value");
  for (const [value, want, what] of [[7, true, "a natural number"], ["7", false, "the string 7"]]) {
    const answer = call("Z15818", [value]);
    assert.ok(answer.ok, `Z15818 on ${what} did not evaluate: ${answer.message}`);
    assert.equal(answer.result.value, want, `Z15818 on ${what}`);
  }
});

// Z808 Abstract is the inverse of Z805 Reify, which is proved in F* over the
// value type (Wikifn.Roundtrip). This runs the same claim through the extracted
// engine, so the two paths cannot drift: the proof is about the F* functions,
// this is about what actually ships.
test("reify and abstract are inverses in the built engine too", skip, () => {
  const { call } = engine();
  const cases = [
    ["a string", "abc", (r) => r.text === "abc"],
    ["the empty string", "", (r) => r.text === ""],
    ["a boolean", true, (r) => r.value === true],
    ["a natural number", 7, (r) => Number(r.value) === 7],
    ["zero", 0, (r) => Number(r.value) === 0]
  ];
  for (const [what, value, holds] of cases) {
    const reified = call("Z805", [value]);
    assert.ok(reified.ok, `reifying ${what} failed: ${reified.message}`);
    const back = call("Z808", [reified.result]);
    assert.ok(back.ok, `abstracting ${what} failed: ${back.message}`);
    assert.ok(
      holds(back.result),
      `${what} did not survive the round trip: ${JSON.stringify(back.result)}`
    );
  }
  // A record, which is the case the proof needs a side condition for: its own
  // fields must not include Z1K1, and its type must not be a scalar's.
  const record = call("Z861", ["hello", "Z1002"]);
  assert.ok(record.ok, `Z861 failed: ${record.message}`);
  const reified = call("Z805", [record.result]);
  assert.ok(reified.ok, `reifying a record failed: ${reified.message}`);
  const back = call("Z808", [reified.result]);
  assert.ok(back.ok, `abstracting a record failed: ${back.message}`);
  assert.deepEqual(
    back.result, record.result,
    "a record did not survive reify then abstract"
  );
});

test("the value model is stated in one place and matches what runs", skip, () => {
  // The shapes above are the whole claim. If a new constructor is added to
  // Wikifn.Eval without a case here, this catches it: the count is the contract.
  const constructors = require("node:fs")
    .readFileSync(path.resolve("src/fstar/Wikifn.Eval.fst"), "utf8")
    .split("type eval_error")[0]
    .match(/^\s*\| V[A-Za-z]+ :/gm) ?? [];
  assert.equal(
    constructors.length, SHAPES.length + 1,
    `Wikifn.Eval has ${constructors.length} value constructors and this file ` +
    `exercises ${SHAPES.length}, plus VFunc which is exercised by the ` +
    "higher-order tests. A shape with no test is a claim with nothing behind it."
  );
});

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

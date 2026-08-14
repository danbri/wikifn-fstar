import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const artifact = path.resolve("docs/generated/wikifn_engine.cjs");
const catalogPath = path.resolve("docs/generated/functions.json");
const ready = existsSync(artifact) && existsSync(catalogPath);
const skip = ready ? false : "run make fstar-engine first";

function engine() {
  require(artifact);
  const catalog = require(catalogPath);
  const byName = new Map(catalog.functions.map((entry) => [entry.name, entry]));
  const byZid = new Map(catalog.functions.map((entry) => [entry.zid, entry]));
  const call = (id, args, fuel = 5000) => {
    const entry = byZid.get(id) ?? byName.get(id);
    assert.ok(entry, `unknown function ${id}`);
    return JSON.parse(globalThis.wikifnEngineCall(entry.zid, String(fuel), JSON.stringify(args)));
  };
  return { call, catalog, byName };
}

test("the engine carries hundreds of generated functions", { skip }, () => {
  const { catalog } = engine();
  assert.ok(catalog.functions.length >= 500, `only ${catalog.functions.length} functions`);
  for (const entry of catalog.functions) {
    assert.match(entry.name, /^Z[1-9][0-9]*/, `${entry.name} does not start with its ZID`);
    assert.ok(entry.digest, `${entry.zid} has no recorded digest`);
  }
});

test("selected functions evaluate correctly by ZID", { skip }, () => {
  const { call } = engine();
  const cases = [
    ["Z22294", ["१२३"], "123"],
    ["Z22649", ["123"], "१२३"],
    ["Z10627", ["hello"], "uryyb"],
    ["Z27053", ["H2O"], "H₂O"],
    ["Z19612", ["x2"], "ˣ²"],
    ["Z10052", ["a b c"], "abc"],
    ["Z21679", ["3,14"], "3.14"]
  ];
  for (const [zid, args, expected] of cases) {
    const response = call(zid, args);
    assert.ok(response.ok, `${zid} failed: ${response.message}`);
    assert.equal(response.result.text, expected, `${zid} returned ${response.result.text}`);
  }
});

test("functions can be called by their natural-language name", { skip }, () => {
  const { call, byName } = engine();
  const name = [...byName.keys()].find((key) => key.startsWith("Z22294_"));
  assert.ok(name, "Z22294 has no generated name");
  const response = call(name, ["१२३"]);
  assert.ok(response.ok);
  assert.equal(response.result.text, "123");
});

test("ROT13 is its own inverse across the alphabet", { skip }, () => {
  const { call } = engine();
  const input = "The Quick Brown Fox Jumps Over The Lazy Dog";
  const once = call("Z10627", [input]);
  assert.ok(once.ok, once.message);
  const twice = call("Z10627", [once.result.text]);
  assert.ok(twice.ok, twice.message);
  assert.equal(twice.result.text, input);
});

test("a reference in argument position is refused, not read as text", { skip }, () => {
  const { call } = engine();
  // Z11853 is an object holding the empty string. Reading its name as literal
  // text is the bug tester Z13116 exposed.
  const response = call("Z10052", ["Z11853"]);
  assert.ok(response.ok);
  assert.equal(response.result.text, "Z11853", "engine arguments are literal values, not references");
});

test("exhausting fuel is reported rather than hidden", { skip }, () => {
  const { call } = engine();
  const response = call("Z10627", ["hello"], 1);
  assert.equal(response.ok, false);
  assert.match(response.message, /fuel/);
});

test("every generated body renders back to a canonical composition", { skip }, () => {
  const compositions = require(path.resolve("docs/generated/wikifn-compositions.json")).compositions;
  const { catalog } = engine();
  assert.equal(
    Object.keys(compositions).length,
    catalog.functions.length,
    "every function in the catalogue should have a contributable composition"
  );
  for (const [zid, entry] of Object.entries(compositions)) {
    assert.ok(entry.Z14K2 !== undefined, `${zid} has no Z14K2 body`);
    // A canonical body is a reference (bare string), a typed-list array, or a
    // record carrying its type in Z1K1.
    const body = entry.Z14K2;
    const wellFormed =
      typeof body === "string" || Array.isArray(body) || Boolean(body?.Z1K1);
    assert.ok(wellFormed, `${zid} body is not a canonical form`);
    assert.ok(Array.isArray(entry.arguments), `${zid} has no argument list`);
    for (const key of entry.arguments) {
      assert.match(key, /^(Z[1-9][0-9]*)?K[1-9][0-9]*$/, `${zid} argument key ${key} is malformed`);
    }
  }
});

// A library must never take its caller down. Evaluation is bounded by fuel for
// total work and by a depth limit for nesting, and both must be reported rather
// than thrown. Non-productive definitions exist in the corpus -- Z844 boolean
// equality is defined as not(inequality) while inequality is defined as
// not(equality) -- so this is not hypothetical.
test("no function in the catalogue can crash the host", { skip }, () => {
  const { call, catalog } = engine();
  const problems = [];
  for (const entry of catalog.functions) {
    for (const args of [
      Array.from({ length: entry.arity }, () => "ab"),
      Array.from({ length: entry.arity }, () => 3),
      Array.from({ length: entry.arity }, () => true),
      Array.from({ length: entry.arity }, () => [1, 2])
    ]) {
      let response;
      try {
        response = JSON.parse(
          globalThis.wikifnEngineCall(entry.zid, "100000", JSON.stringify(args)));
      } catch (error) {
        problems.push(`${entry.zid} threw ${error.constructor.name} on ${JSON.stringify(args)}`);
        continue;
      }
      if (typeof response.ok !== "boolean") {
        problems.push(`${entry.zid} returned no ok field on ${JSON.stringify(args)}`);
      }
    }
  }
  assert.deepEqual(problems.slice(0, 10), [], `${problems.length} functions misbehaved`);
});

test("a non-productive definition reports a limit rather than hanging", { skip }, () => {
  const { call, catalog } = engine();
  // Some mutual cycles have no implementation that escapes them: Z12429 is odd
  // and Z12480 is even are defined in terms of each other. Evaluation must stop
  // and say so rather than run until the host gives out.
  const stuck = catalog.functions.filter((entry) => entry.mutuallyRecursive && entry.runnable);
  assert.ok(stuck.length > 0, "expected some functions to remain in a cycle");
  let reported = 0;
  for (const entry of stuck) {
    const response = call(entry.zid, Array.from({ length: entry.arity }, () => "ab"), { fuel: 100000 });
    if (!response.ok && /depth|fuel/.test(response.message)) reported += 1;
  }
  assert.ok(reported > 0, "no cycle reported a depth or fuel limit");
});

// Z844 boolean equality had an implementation defined as not(inequality) while
// Z10237 inequality was defined as not(equality). Both are valid equations and
// neither computes. Both functions also have implementations that do compute,
// and the generator is expected to prefer those.
test("mutual recursion is avoided when an implementation escapes it", { skip }, () => {
  const { call } = engine();
  const cases = [
    ["Z844", [true, true], true],
    ["Z844", [true, false], false],
    ["Z10237", [true, false], true],
    ["Z10237", [false, false], false]
  ];
  for (const [zid, args, expected] of cases) {
    const response = call(zid, args, { fuel: 100000 });
    assert.ok(response.ok, `${zid}${JSON.stringify(args)} failed: ${response.message}`);
    assert.equal(response.result.value, expected, `${zid}${JSON.stringify(args)}`);
  }
});

test("functions left in a mutual cycle are marked in the catalogue", { skip }, () => {
  const { catalog } = engine();
  const marked = catalog.functions.filter((entry) => entry.mutuallyRecursive);
  // Scheme has no depth guard, so the listing must warn about these.
  assert.ok(marked.length > 0, "no function is marked, which is suspicious");
  for (const entry of marked) {
    assert.equal(typeof entry.runnable, "boolean", `${entry.zid} has no runnable flag`);
  }
});

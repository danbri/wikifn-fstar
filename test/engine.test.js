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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildWorld, evaluate, evaluationSummary, normalizeCanonical, parseJsonStrict, toCanonicalJson } from "../src/index.js";
import { naturalNumber } from "../src/builtins.js";

async function readJson(path) {
  const parsed = parseJsonStrict(await readFile(path, "utf8"));
  assert.equal(parsed.ok, true);
  return parsed.value;
}

test("recursive Z14 composition evaluates add(2, 2)", async () => {
  const snapshot = await readJson("examples/add-snapshot.json");
  const callJson = await readJson("examples/add-call.json");
  const world = buildWorld(snapshot);
  const call = normalizeCanonical(callJson);
  assert.equal(world.ok, true);
  assert.equal(call.ok, true);

  const result = evaluate(world.value, call.value, { fuel: 100 });
  assert.equal(result.ok, true);
  assert.deepEqual(toCanonicalJson(result.value.value), { Z1K1: "Z10", Z10K1: "4" });
  assert.equal(result.value.fuelRemaining < 100, true);

  const summary = evaluationSummary(result);
  assert.equal(summary.ok, true);
  assert.deepEqual(summary.value.value, { Z1K1: "Z10", Z10K1: "4" });
  assert.equal(summary.value.implementations.includes("Z781@Z722:1"), true);
});

test("evaluation fuel bounds recursive composition", async () => {
  const snapshot = await readJson("examples/add-snapshot.json");
  const callJson = await readJson("examples/add-call.json");
  const world = buildWorld(snapshot);
  const call = normalizeCanonical(callJson);

  const result = evaluate(world.value, call.value, { fuel: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "fuel_exhausted");
});

test("Z802/if is lazy in the untaken branch", () => {
  const world = buildWorld({ objects: [] });
  assert.equal(world.ok, true);
  const call = normalizeCanonical({
    Z1K1: "Z7",
    Z7K1: "Z802",
    Z802K1: { Z1K1: "Z40", Z40K1: "Z41" },
    Z802K2: { Z1K1: "Z10", Z10K1: "9" },
    Z802K3: { Z1K1: "Z7", Z7K1: "Z99999" }
  });
  assert.equal(call.ok, true);
  const result = evaluate(world.value, call.value, { fuel: 10 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.value, naturalNumber(9n));
});

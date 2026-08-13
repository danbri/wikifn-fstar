import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCanonical, parseJsonStrict, toCanonicalJson, toNormalJson } from "../src/index.js";

test("strict JSON parser rejects duplicate keys", () => {
  const parsed = parseJsonStrict('{"Z1K1":"Z6","Z1K1":"Z9"}');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "json_duplicate_key");
});

test("bare ZID strings normalize to references", () => {
  const normalized = normalizeCanonical("Z10");
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.value, { kind: "ref", zid: "Z10" });
  assert.equal(toCanonicalJson(normalized.value), "Z10");
});

test("explicit Z6 escapes strings that look like ZIDs", () => {
  const normalized = normalizeCanonical({ Z1K1: "Z6", Z6K1: "Z10" });
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.value, { kind: "string", value: "Z10" });
  assert.deepEqual(toCanonicalJson(normalized.value), { Z1K1: "Z6", Z6K1: "Z10" });
  assert.deepEqual(toNormalJson(normalized.value), { Z1K1: "Z6", Z6K1: "Z10" });
});

test("Benjamin arrays normalize to Z881 typed-list records", () => {
  const normalized = normalizeCanonical(["Z6", "a", "b"]);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.kind, "record");
  assert.deepEqual(toCanonicalJson(normalized.value), {
    Z1K1: { Z1K1: "Z7", Z7K1: "Z881", Z881K1: "Z6" },
    K1: "a",
    K2: {
      Z1K1: { Z1K1: "Z7", Z7K1: "Z881", Z881K1: "Z6" },
      K1: "b",
      K2: {
        Z1K1: { Z1K1: "Z7", Z7K1: "Z881", Z881K1: "Z6" }
      }
    }
  });
});

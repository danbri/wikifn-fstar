import assert from "node:assert/strict";
import test from "node:test";

import { buildWorld, digestCanonical } from "../src/index.js";

test("snapshot importer pins revision and digest", () => {
  const canonical = {
    Z1K1: "Z2",
    Z2K1: { Z1K1: "Z6", Z6K1: "Z10000" },
    Z2K2: { Z1K1: "Z10", Z10K1: "7" }
  };
  const world = buildWorld({
    objects: [{ zid: "Z10000", revision: 123, digest: digestCanonical(canonical), canonical }]
  });
  assert.equal(world.ok, true);
  const version = world.value.get("Z10000");
  assert.equal(version.revision, 123);
  assert.equal(version.digest, digestCanonical(canonical));
});

test("snapshot importer rejects mismatched Z2K1", () => {
  const world = buildWorld({
    objects: [
      {
        zid: "Z10000",
        revision: 123,
        canonical: {
          Z1K1: "Z2",
          Z2K1: { Z1K1: "Z6", Z6K1: "Z10001" },
          Z2K2: { Z1K1: "Z10", Z10K1: "7" }
        }
      }
    ]
  });
  assert.equal(world.ok, false);
  assert.equal(world.error.code, "persistent_id_mismatch");
});

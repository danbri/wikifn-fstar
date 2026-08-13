import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { digestCanonical, WikifunctionsCache } from "../src/index.js";

test("WikifunctionsCache stores and reads pinned revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "wikifn-cache-"));
  const cache = new WikifunctionsCache(root);
  const canonical = {
    Z1K1: "Z2",
    Z2K1: "Z22294",
    Z2K2: { Z1K1: "Z8" }
  };

  await cache.put({
    zid: "Z22294",
    revision: 214920,
    timestamp: "2025-09-04T13:43:44Z",
    user: "Saurmandal",
    digest: digestCanonical(canonical),
    canonical
  });

  const latest = await cache.getLatest("Z22294");
  assert.equal(latest.zid, "Z22294");
  assert.equal(latest.revision, 214920);
  assert.equal(latest.cacheHit, true);
  assert.deepEqual(latest.canonical, canonical);

  const stats = await cache.stats();
  assert.equal(stats.objects, 1);
  assert.equal(stats.revisions, 1);
});

test("WikifunctionsCache treats digest mismatch as a cache miss", async () => {
  const root = await mkdtemp(join(tmpdir(), "wikifn-cache-"));
  const cache = new WikifunctionsCache(root);
  const canonical = {
    Z1K1: "Z2",
    Z2K1: "Z1",
    Z2K2: { Z1K1: "Z4" }
  };
  await cache.put({
    zid: "Z1",
    revision: 1,
    timestamp: "2026-08-13T00:00:00Z",
    user: "fixture",
    canonical
  });

  await writeFile(join(root, "objects", "Z1", "1.json"), "{\"canonical\":{\"tampered\":true},\"digest\":\"bad\"}\n");
  assert.equal(await cache.getLatest("Z1"), undefined);
});

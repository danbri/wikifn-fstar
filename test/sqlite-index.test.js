import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildSqliteIndex, runSqliteQuery, sqliteIndexStats, WikifunctionsCache } from "../src/index.js";

const hasSqlite = spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).status === 0;

test("SQLite index records functions, implementations, and composition calls", { skip: !hasSqlite }, async () => {
  const root = await mkdtemp(join(tmpdir(), "wikifn-cache-"));
  const dbPath = join(root, "wikifn.sqlite");
  const cache = new WikifunctionsCache(root);

  await cache.put({
    zid: "Z9000",
    revision: 9000,
    timestamp: "2026-08-13T00:00:00Z",
    user: "fixture",
    canonical: persistent("Z9000", {
      Z1K1: "Z8",
      Z8K1: ["Z17"],
      Z8K2: "Z40",
      Z8K3: ["Z20"],
      Z8K4: ["Z14", "Z9001"],
      Z8K5: "Z9000"
    })
  });

  await cache.put({
    zid: "Z9001",
    revision: 9001,
    timestamp: "2026-08-13T00:00:00Z",
    user: "fixture",
    canonical: persistent("Z9001", {
      Z1K1: "Z14",
      Z14K1: "Z9000",
      Z14K2: {
        Z1K1: "Z7",
        Z7K1: "Z782",
        Z782K1: {
          Z1K1: "Z18",
          Z18K1: "Z9000K1"
        }
      }
    })
  });

  const build = await buildSqliteIndex({ cacheDir: root, dbPath });
  assert.equal(build.functions, 1);
  assert.equal(build.implementations, 1);
  assert.equal(build.compositionCalls, 1);

  const stats = await sqliteIndexStats(dbPath);
  assert.equal(stats.functions, 1);
  assert.equal(stats.implementations, 1);
  assert.equal(stats.composition_calls, 1);

  const rows = JSON.parse(
    await runSqliteQuery(
      dbPath,
      "select from_impl_zid, to_function_zid, path from composition_calls order by ordinal"
    )
  );
  assert.deepEqual(rows, [{ from_impl_zid: "Z9001", to_function_zid: "Z782", path: "$.Z7K1" }]);
});

function persistent(zid, value) {
  return {
    Z1K1: "Z2",
    Z2K1: {
      Z1K1: "Z6",
      Z6K1: zid
    },
    Z2K2: value
  };
}

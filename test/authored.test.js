// Compositions written here rather than read from the dump.
//
// Everything else in this repo is a mechanical translation of something pinned
// in the Wikifunctions dump, and its warrant is the digest it came from. A file
// in compositions/ has no such warrant: it is a claim about what a function
// means, written by us, to fill a gap where the wiki has only a code
// implementation.
//
// So it is trusted exactly as far as it is tested. Every file here must pass
// the Wikifunctions testers for the function it implements, and a function with
// no testers is refused rather than accepted on trust - there would be nothing
// to check it against.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(".");
const authoredDir = path.join(root, "compositions");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.join(root, "cache", "wikifunctions");
const enginePath = path.join(root, "docs", "generated", "wikifn_engine.cjs");

const authored = readdirSync(authoredDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, entry: JSON.parse(readFileSync(path.join(authoredDir, name), "utf8")) }));

function pinned(zid) {
  const dir = path.join(cacheDir, "objects", zid);
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"))
    .sort((a, b) => Number(path.basename(a, ".json")) - Number(path.basename(b, ".json")));
  if (!files.length) return undefined;
  return JSON.parse(readFileSync(path.join(dir, files[files.length - 1]), "utf8")).canonical;
}

const refZid = (value) =>
  typeof value === "string" ? value
  : value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string" ? value.Z9K1
  : undefined;

test("there is at least one composition written here", () => {
  assert.ok(authored.length > 0, "compositions/ holds no definitions");
});

for (const { name, entry } of authored) {
  test(`${name} is a well-formed authored composition`, () => {
    assert.ok(entry.zid, "no zid");
    assert.equal(name, `${entry.zid}.json`, "the file is named for its ZID");
    assert.ok(entry.Z14K2 !== undefined, "no Z14K2 body");
    assert.ok(Array.isArray(entry.arguments), "no argument list");
    // Required, because a gap nobody can explain is a gap nobody should fill.
    assert.ok(
      typeof entry.why === "string" && entry.why.length > 20,
      "no `why`: say what gap this fills and why the corpus does not"
    );
  });

  test(`${name} matches the pinned Z8 it implements`, () => {
    const object = pinned(entry.zid);
    assert.ok(object, `${entry.zid} is not in the pinned cache`);
    const signature = object.Z2K2;
    assert.equal(refZid(signature?.Z1K1), "Z8", `${entry.zid} is not a function`);
    const declared = (signature.Z8K1 ?? [])
      .filter((item) => typeof item === "object" && item?.Z17K2)
      .map((item) => refZid(item.Z17K2) ?? item.Z17K2);
    assert.deepEqual(
      entry.arguments, declared,
      "the argument keys must match the pinned Z8, in order, or a call binds the wrong values"
    );
  });

  test(`${name} fills a gap rather than overriding the corpus`, () => {
    const object = pinned(entry.zid);
    const implementations = (object?.Z2K2?.Z8K4 ?? []).filter((item) => item !== "Z14");
    for (const implZid of implementations.map((item) => refZid(item)).filter(Boolean)) {
      const implementation = pinned(implZid);
      assert.equal(
        implementation?.Z2K2?.Z14K2, undefined,
        `${implZid} is a composition on the wiki, so ${entry.zid} is not a gap`
      );
    }
  });
}

// The real check. Everything above is shape; this is whether it computes what
// Wikifunctions says the function computes.
const engineBuilt = existsSync(enginePath);

test("every authored composition passes the function's own testers", {
  skip: engineBuilt ? false : "no built engine; run make fstar-engine",
  // A sweep spawns the engine and runs every tester for these functions.
  timeout: 600_000
}, async () => {
  // Where each file's evidence comes from. Usually the function's own testers;
  // a validator has none of its own and is checked through the testers of the
  // function it validates, which the file has to name.
  const evidence = new Map(authored.map(({ entry }) =>
    [entry.zid, entry.checkedBy ?? [entry.zid]]));
  const zids = [...new Set([...evidence.values()].flat())];
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(root, "scripts", "check-engine-testers.js"),
    "--json", "--only", zids.join(",")
  ], { maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(stdout);

  assert.equal(
    report.counts.fail + report.counts.error, 0,
    "an authored composition disagrees with the testers for the function it " +
    `implements:\n${JSON.stringify(report.failures, null, 2)}`
  );
  // Per function, not in total. A zero pass count would satisfy the assertion
  // above while checking nothing, and so would one function carrying the
  // evidence for all of them - which is exactly the trust this file exists to
  // withhold. A function missing here is either absent from the built engine,
  // or has no tester this harness can read; both mean it is untested, and an
  // untested authored composition should not be in the tree.
  const passing = new Set(report.passingFunctions ?? []);
  const unchecked = [...evidence.entries()]
    .filter(([, sources]) => !sources.some((zid) => passing.has(zid)))
    .map(([zid, sources]) => `${zid} (evidence: ${sources.join(", ")})`);
  assert.deepEqual(
    unchecked, [],
    "an authored composition has no passing tester, so nothing checks it. " +
    "Either nothing in the corpus exercises it - in which case it should not " +
    "be written here - or the engine was built before the composition was " +
    "added, or `checkedBy` names the wrong function."
  );
});

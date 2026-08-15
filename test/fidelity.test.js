// How close the compositions we emit are to the ones we read.
//
// docs/generated/wikifn-compositions.json is described as every body "back as
// canonical Wikifunctions compositions", and the generator reports a round trip
// as "identical" for all of them. Those two facts sound like the same claim and
// are not.
//
// The generator's check is render -> read again -> same tree. That is
// self-consistency: it proves our reader and our writer agree with each other.
// It says nothing about whether what we write matches what we read from the
// corpus, because both sides of that comparison are ours.
//
// This is the other measurement, and it is the one the description implies:
// compare the emitted Z14K2 against the pinned Z14K2 it was translated from.
// The number is lower, and it is recorded here so it can only improve.
//
// Not every difference is a defect. Canonical Wikifunctions has more than one
// way to write the same thing - a string is a bare string or a Z6 object, and
// both mean the string - so a difference is a difference in spelling until
// someone shows it is a difference in meaning. What must never happen is a
// difference in *meaning*, and the guard against that is
// test/compiled.test.js plus the tester sweep, not this file.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const compositionsPath = path.resolve("docs/generated/wikifn-compositions.json");
const cataloguePath = path.resolve("docs/generated/functions.json");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.resolve("cache/wikifunctions");

const skip = !existsSync(compositionsPath) || !existsSync(path.join(cacheDir, "objects"))
  ? { skip: "no generated compositions or no local cache" }
  : {};

// Key order carries no meaning in canonical form, so it is normalised away
// before comparing. Everything else is compared as written.
const sorted = (value) => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  }
  return value;
};

function pinnedBody(implementation) {
  const dir = path.join(cacheDir, "objects", implementation);
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"))
    .sort((a, b) => Number(path.basename(a, ".json")) - Number(path.basename(b, ".json")));
  return JSON.parse(readFileSync(path.join(dir, files[files.length - 1]), "utf8"))
    .canonical?.Z2K2?.Z14K2;
}

function measure() {
  const compositions = require(compositionsPath).compositions;
  const catalogue = require(cataloguePath);
  let identical = 0;
  let different = 0;
  const examples = [];
  for (const entry of catalogue.functions) {
    const ours = compositions[entry.zid]?.Z14K2;
    if (ours === undefined) continue;
    let pinned;
    try { pinned = pinnedBody(entry.implementation); } catch { continue; }
    if (pinned === undefined) continue;
    if (JSON.stringify(sorted(pinned)) === JSON.stringify(sorted(ours))) identical += 1;
    else {
      different += 1;
      if (examples.length < 5) examples.push(`${entry.zid} ${entry.label}`);
    }
  }
  return { identical, different, examples };
}

// Lower this as fidelity improves; never raise it. Raising it means something
// that used to come back exactly no longer does.
const DIFFERENT_BUDGET = 963;

test("every emitted composition is carried back with its pinned original available", skip, () => {
  const { identical, different } = measure();
  assert.ok(identical + different > 3000, "the comparison did not cover the corpus");
});

test("emitted compositions match the pinned originals", skip, () => {
  const { identical, different, examples } = measure();
  assert.ok(
    different <= DIFFERENT_BUDGET,
    `${different} of ${identical + different} emitted compositions differ from the ` +
    `composition they were translated from; budget ${DIFFERENT_BUDGET}.\n` +
    "  The generator's own round-trip check does not catch this: it compares our\n" +
    "  writer against our reader, and both are ours.\n" +
    (examples.length ? `  for example: ${examples.join(", ")}` : "")
  );
});

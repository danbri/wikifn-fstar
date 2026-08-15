// Which proof obligations are still open.
//
// An `admit ()` in F* discharges a goal by assumption. It is a legitimate way to
// record work in progress and a terrible thing to lose track of, because the
// module still checks and the claim still reads as proved. This counts them, so
// an obligation can only be added deliberately and can never be forgotten.
//
// `assume val` is the same thing for a declaration and is counted with it.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const fstarDir = path.resolve("src/fstar");

// Each entry says where an obligation is open and why. Removing one means the
// proof landed; adding one means a new gap, and it has to be named here.
const OPEN = [
  {
    file: "Wikifn.Model.fst",
    what: "assume val has_type",
    count: 1,
    why: "The typing rules are not written. Declared types are carried from each "
       + "Z8 as documentation; nothing checks them."
  },
  {
    file: "Wikifn.Semantics.fst",
    what: "assume val composition_expr, eval, eval_preserves_type",
    count: 3,
    why: "This module states evaluation over the full ZObject model, which the "
       + "working evaluator does not use - Wikifn.Eval runs over an expression "
       + "type rather than over zterm directly. The signatures record the "
       + "intended shape so the gap stays visible; connecting the two is the "
       + "last step of the model work."
  },
  {
    file: "Wikifn.Fuel.fst",
    what: "admit () in higher_order_extra",
    count: 1,
    why: "Whether a higher-order form applies depends on the function and the "
       + "argument shapes and never on the fuel, which is true by inspection of "
       + "higher_order but opaque to the solver inside its own mutual group. The "
       + "other six lemmas, including eval_extra, discharge - relative to this "
       + "one, since they are a single mutual group."
  }
];

const obligationsIn = (source) =>
  (source.match(/\badmit\s*\(\s*\)/g) ?? []).length +
  (source.match(/^assume val /gm) ?? []).length;

test("every open proof obligation is one that is written down", () => {
  const declared = new Map(OPEN.map((row) => [row.file, row]));
  const found = [];
  for (const name of readdirSync(fstarDir).filter((f) => f.endsWith(".fst"))) {
    // Comments describe obligations too; only count them where they are code.
    const source = readFileSync(path.join(fstarDir, name), "utf8")
      .replace(/\(\*[\s\S]*?\*\)/g, "");
    const count = obligationsIn(source);
    if (count > 0) found.push({ file: name, count });
  }

  const unexpected = found.filter((row) => !declared.has(row.file));
  assert.deepEqual(
    unexpected.map((row) => `${row.file}: ${row.count}`), [],
    "a proof obligation was opened in a file that does not declare one.\n" +
    "  Add it to OPEN in this file, with why, or discharge it."
  );

  const wrong = found
    .filter((row) => declared.get(row.file).count !== row.count)
    .map((row) => `${row.file}: ${row.count}, declared ${declared.get(row.file).count}`);
  assert.deepEqual(
    wrong, [],
    "the number of open obligations in a file changed.\n" +
    "  Lowering it is the point - update the count. Raising it needs a reason."
  );
});

// A module that is never checked is a module that proves nothing, and adding
// one is easy to forget: the file sits in src/fstar looking like the rest.
test("every F* module is actually checked", () => {
  const order = readFileSync(path.resolve("scripts/fstar-check.sh"), "utf8");
  const generated = /Generated\.Eval\.(Part|Values)/;
  const missing = readdirSync(fstarDir)
    .filter((name) => name.endsWith(".fst"))
    // The generated parts and their shared values are found by a glob rather
    // than listed, because there are dozens and the count changes.
    .filter((name) => !generated.test(name))
    .filter((name) => !order.includes(name));
  assert.deepEqual(
    missing, [],
    "an F* module is not in scripts/fstar-check.sh, so nothing verifies it"
  );
});

// The laws that other work rests on. Naming them here means removing one is a
// deliberate act rather than something that quietly stops being true.
const PROVED = [
  {
    file: "Wikifn.Zid.Laws.fst",
    lemmas: ["parse_render_nat", "parse_render_zid", "parse_render_zkey"],
    why: "Identifiers, keys and numbers are text in Wikifunctions. Reify writes "
       + "those spellings and Abstract reads them, so the two are inverses only "
       + "if writing and reading agree."
  },
  {
    file: "Wikifn.Roundtrip.fst",
    lemmas: ["reify_abstract", "reify_then_abstract", "reify_answers_for"],
    why: "Z805 Reify and Z808 Abstract are inverses, for every shape Reify "
       + "answers for. The corpus asks and answers type questions with the "
       + "pair - Z15818 is Natural number is car(reify(x)) = car(reify(0)) - "
       + "so if they disagreed those answers would be wrong silently."
  }
];

test("the laws other work rests on are still proved", () => {
  for (const row of PROVED) {
    const source = readFileSync(path.join(fstarDir, row.file), "utf8");
    for (const lemma of row.lemmas) {
      assert.match(
        source, new RegExp(`^let (rec )?${lemma}\\b`, "m"),
        `${row.file} no longer proves ${lemma}. ${row.why}`
      );
    }
    assert.equal(
      obligationsIn(source.replace(/\(\*[\s\S]*?\*\)/g, "")), 0,
      `${row.file} carries an open obligation, so what it states is not proved`
    );
  }
});

test("nothing claims to be proved that rests on an admit", () => {
  const fuel = readFileSync(path.join(fstarDir, "Wikifn.Fuel.fst"), "utf8");
  // The two theorems a caller would cite must say so in the file itself, so the
  // caveat travels with the statement rather than living only in a commit.
  // The wording may change as the proof lands - "stated, not proved" became
  // "proved, relative to one assumption" when eval_extra started discharging -
  // but while anything in the file rests on an admit, the theorems a caller
  // would cite have to say so next to themselves, not only in a commit message.
  assert.match(
    fuel, /STATED, NOT PROVED|PROVED, RELATIVE TO/,
    "Wikifn.Fuel states fuel monotonicity; while it rests on an admit it has to say so"
  );
});

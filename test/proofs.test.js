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
    what: "admit () in eval_extra and higher_order_extra",
    count: 2,
    why: "Fuel monotonicity needs a second mutual induction - that exhaustion "
       + "propagates - before each recursive call's precondition can be "
       + "discharged from its parent's. The other five lemmas in the group are "
       + "proved relative to these two, not independently."
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

test("nothing claims to be proved that rests on an admit", () => {
  const fuel = readFileSync(path.join(fstarDir, "Wikifn.Fuel.fst"), "utf8");
  // The two theorems a caller would cite must say so in the file itself, so the
  // caveat travels with the statement rather than living only in a commit.
  assert.match(
    fuel, /STATED, NOT PROVED/,
    "Wikifn.Fuel states fuel monotonicity; while it rests on an admit it has to say so"
  );
});

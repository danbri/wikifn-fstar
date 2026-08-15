---
name: generated-term-size
description: Use when a generated F* module, OCaml file, or JS bundle fails with an out-of-memory kill, "Stack overflow", or a solver timeout - the cause is usually one term that is too large, and each tool in the chain has a different limit. Read this before raising a size cap or skipping a function.
---

# When a generated term is too large

Every tool downstream of `scripts/generate-fstar-eval.js` has a size at which it
stops working, and each one fails differently. The failure names the tool, never
the function, so the first job is always to find which body caused it.

## Measured limits

| tool | fails at | how it fails |
|---|---|---|
| F* checking one module | ~3,700 bodies in one module | 66 GB peak, OOM kill |
| F* checking one term | ~64 KB rendered | solver gives up, or `Unexpected error: Stack overflow` |
| `js_of_ocaml` | a cons chain of a few thousand | `js_of_ocaml: Error: Stack overflow`, no location |
| the s-expression printer | ~900 levels of nesting | JavaScript stack, during export |

The first three all mean the same thing and none of them says so.

## What actually works

**Split the module, not the term.** `PART_SIZE` bodies per module; verification
cost is sharply superlinear in module size and F* caches per module, so a
regeneration only re-checks what changed. `scripts/fstar-check.sh` runs one
module per process because F* does not release memory between modules.

**Name the term, do not shrink it.** A large literal lifted to its own
module-level definition is checked once; left inside a body it lands in every
query that body generates. `hoistValue` in the generator does this, and it goes
all the way down: a record with a huge field names the field, a list with a huge
element names the element, a list that is merely long is split into runs and
concatenated. Stopping at the top level does not help, because the shape that
appears in the corpus is usually nested.

**Keep the hoisted rendering even when the result is small.** The bug worth
remembering: after naming a record's two fields the record itself is short, so
the "is this over the threshold" test says no - and rendering it again without
the names throws the whole thing away. Measured cost of that mistake: 3,891
functions down to 3,882.

**Raise the stack for `js_of_ocaml`.** macOS defaults to 8 MB and caps at
`ulimit -Hs` (about 64 MB). `scripts/build-fstar-engine.sh` raises it for that
step. This is the one case where raising a limit is the right answer, because
the term is already as small as it can be made and the tool is only recursing
over it.

## What does not work

- Raising `MAX_BODY_BYTES`. F* does not overflow at a threshold you can pick;
  it overflows on the term, and one of 166 KB kills it whatever the constant says.
- Hoisting a single term that is itself over the limit. A name does not make it
  smaller. If it cannot be split structurally, record the skip with its size in
  the generation report and move on - `Z24460` at 166,813 bytes and `Z37473` at
  94,602 are expression trees, not literals, and there is nothing to lift out.

## Order of work

1. Reproduce with one module: `fstar.exe --cache_checked_modules --include src/fstar --odir src/fstar/.cache <module>`.
2. Find the body: `node scripts/generate-fstar-eval.js --report build/generation-report.json`, then read `skippedFunctions` - each entry carries the rendered size.
3. Check the shape before changing anything. A list splits, a record splits, a
   deep call tree does not.
4. Re-run the whole chain. F* passing proves nothing about `js_of_ocaml`: the
   Values module that F* verified in seconds is the one that overflowed the JS
   compiler ten minutes later.

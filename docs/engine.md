# The Wikifn Engine

1,369 real Wikifunctions compositions compiled into F* functions, checked by F*, and
extracted to OCaml and then JavaScript — plus an interpreter over 3,890 of them, which is
how the rest are reached and how the compiled ones are checked against something.

## What is generated and what is authored

This distinction matters more than any other claim on this page, so it comes first.

**Mechanically generated from the pinned corpus** — no judgement involved, reproducible
by re-running the generator, and stamped with the revision and digest of the source
object:

| file | contents |
|---|---|
| `src/fstar/Wikifn.Compiled.Direct.fst` | **1,369 compositions as F\* functions**, each a translation of a pinned `Z14K2` tree |
| `src/fstar/Wikifn.Generated.Eval.PartNN.fst` | the same compositions as data, for the interpreter |
| `src/fstar/Wikifn.Generated.Eval.fst` | dispatch only; it holds no bodies |
| `build/fstar/fn/Wikifn.Fn.ZNNNN.fst` | the same bodies again, one module per function, for verification |
| `docs/generated/functions.json` | the catalogue: ZID, generated name, label, arity, declared types, provenance |
| `docs/generated/wikifn.scm` | the same bodies as s-expressions |

**Authored** — written deliberately, checked by F*, and not derived from anything in the
corpus:

| file | contents |
|---|---|
| `src/fstar/Wikifn.Primitive.Kernel.fst` | what the primitive functions *mean* over codepoint-list text |
| `src/fstar/Wikifn.Eval.fst` | the evaluator, value type, and primitive dispatch |
| `src/fstar/Wikifn.Zid.fst` | identifiers as numbers, with parsing and rendering |
| `src/fstar/Wikifn.Model.fst` | the ZObject term model and its validity predicates |
| `src/fstar/Wikifn.Canonical.fst` | canonical JSON to ZObject term |
| `src/fstar/Wikifn.Print.fst` | rendering an expression as an s-expression |

The authored layer is the trust boundary. Nothing in the corpus says what `Z10075`
means; those definitions are a claim about Wikifunctions that F* cannot check. What F*
checks is that the definitions are total, terminate, and typecheck. What checks the
claim is the tester sweep below.

Both layers were produced with LLM assistance. That is not the useful distinction. The
useful distinction is that the generated layer can be regenerated from pinned data and
will change when the data changes, while the authored layer cannot and will not.

## How it is checked, and why it is split up

The bodies are not one F* module, and that is not a tidiness choice. A single module
holding all of them reaches a **66 GB peak memory footprint** and is killed; four hundred
of the same bodies verify in **4.9 seconds using 300 MB**. Verification cost is sharply
superlinear in module size, so the generator emits parts and the checker runs one module
per process, because F* does not release much between modules within one invocation.

The same bodies are emitted a second time, one module per function, under
`build/fstar/fn/`. Not a copy to keep in step: both layouts are rendered from the same
tree by the same renderer in the same pass. They exist for different jobs.

| | parts, in `src/fstar/` | per function, in `build/fstar/fn/` |
|---|---|---|
| what it is for | extracting to OCaml | verifying |
| why | linking ten OCaml modules is far faster than linking 3,676 | a body F* cannot check fails on its own instead of taking four hundred with it |
| incrementality | a part re-checks when any body in it changes | a function re-checks when its own body changes |
| parallelism | ten | as many as there are functions |

Per-function verification is parallel because there is nothing to order: a call in a body
is a ZID *number* the evaluator resolves at run time, not a module reference. Every
function module depends on `Wikifn.Eval` and on nothing else, so they can be checked in
any order and on any number of machines.

```sh
make fstar-check              # the parts, in dependency order, one process each
make fstar-verify-functions   # every function on its own, in parallel, with a per-function report
```

Measured on a six-core machine, from cold:

| | time |
|---|---|
| `make fstar-check`, 24 modules | 57 s |
| `make fstar-verify-functions`, 3,676 functions | 183 s wall, 18.3 min CPU, median 0.28 s each |

The per-function pass costs about twenty times the CPU and finishes in three times the
wall clock, because it is six ways parallel and would be more on a bigger machine. That
trade is the point: it is the pass that scales out and the pass that tells you *which*
function is the problem. `make fstar-check` remains the one that gates extraction.

This is also how a body that cannot be checked at all gets found rather than guessed at.
`Z24460 is Extended_Pictographic codepoint` carries the whole Unicode
Extended_Pictographic table inline as a codepoint list — 164 KB in a single term. On its
own, in its own module, it reaches 7.95 GB and is killed, while a 32 KB body of the same
shape verifies in 2.5 seconds. The limit is the size of one term, not the size of the
module, so no amount of splitting helps. The generator skips a body over 64 KB and records
the reason.

## Reach

Measured with `make closure` (a fixpoint over the call graph, not a per-seed walk):

| | count |
|---|---|
| functions in the corpus | 4,970 |
| **compiled into F\* functions, checked by F\*** | **1,369** |
| carried as data for the interpreter | 3,890 |
| skipped by the translator, with reasons recorded | 7 |

The first two rows are different things and the difference is the point. A
*function* is `compiled_Z10012_reverse_string`, an F\* definition that F\* checks
and that extracts to an OCaml function and then a JavaScript one; calling it is
a function call. Data is `body_Z10012_reverse_string : expr`, a syntax tree that
the interpreter walks. Both are generated from the same pinned composition in
the same pass, so they cannot disagree about what the corpus says — and
`test/compiled.test.js` requires them to give the same answer on every argument
the corpus's own testers supply.

The 2,521 that are data and not functions are not a limit of the compiler: they
reach a function nobody has implemented, so there is nothing to compile them
into. They are carried because calls are by reference and they start working the
moment the gap is filled.

Recursion was long assumed to be what kept compositions from being compiled into
standalone F* functions, since each recursive one needs a termination measure. Measured
against the implementations actually selected, that assumption was wrong by an order of
magnitude: **217 of 3,890 bodies are recursive at all**, 5.7%, and they take the same fuel
parameter the interpreter already uses. The other 94.3% are plain non-recursive
definitions. What had actually blocked the old direct compiler was that it typed every
parameter and return as `text`, gated recursion on the literal string `"Z14613"`, and
refused lists, records and function values.

## Evidence it is right

`make engine-testers` runs every Wikifunctions tester (`Z20`) whose call and expected
value this harness can read:

| | count |
|---|---|
| testers considered | 10,281 |
| pass | **1,247** |
| fail | 102 |
| error | 1,637 |
| skipped, with reasons | 7,295 |

| | count |
|---|---|
| functions with at least one passing tester | 544 |
| functions passing every tester that could be read | **450** |

A tester is only counted as passing when both its call and its expected value were
readable. Everything else is skipped with a stated reason, never counted as a pass.

The largest remaining buckets are honest limits, not silence:

- an argument this harness cannot convert to a literal is still the largest bucket
- a validator this engine cannot run is the second: errors as values would move most of it
- 264 report a depth limit, from compositions defined through each other with no base case
- `Z889` list equality with both arguments supplied leaves no expected value to infer
- 102 disagree and are worth individual investigation

`make tester-report` groups all of it by cause rather than by message, as
[what still fails](./tester-report.html): 561 failing functions resolve to 101 causes.

Not every disagreement is this engine's fault, and saying which is which matters.
`Z15391 nth Fibonacci number of order k` returns 24 where its tester wants 81, because the
pinned composition it was translated from writes the literal 3 where *k* belongs. The
translation is faithful; the implementation is wrong. See the note on implementation
choice below.

## Names

Generated names put the identifier first and the English label after it:

```scheme
(define (Z22294_devanagari_numerals_to_arabic_numerals a0)
  (Z14613_replace_character_set a0 "०१२३४५६७८९" "0123456789"))
```

The first token maps back to plain Wikifunctions identifiers mechanically, so the text
is readable without becoming unfaithful. Labels come from the pinned snapshot and are
therefore stable. English is used here; the dump carries other languages and the scheme
works unchanged for any of them.

## Evaluation order

Fuel is a budget for total work, not a limit on nesting depth. Passing the same
fuel down every branch bounds how deep evaluation goes but says nothing about how
wide it goes, so a naive Fibonacci with a depth of thirty can make millions of
calls and never run out. The remaining budget is threaded through every result,
so the total number of steps is bounded by what the caller supplied.

Primitives are bounded too. Exponentiation and Unicode ranges would otherwise be
a way to spend arbitrary time inside one call without spending any fuel.

Arguments are evaluated once, bound into an environment, and referred to by index.
The earlier evaluator substituted argument *expressions* into composition bodies, so a
body mentioning an argument twice evaluated it twice, costing 2^depth when such calls
nest — measured at 9.8 seconds for 26 nested `Z11082` calls.

`Z802` remains lazy in its branches. This is not a preference: 230 of the 288 directly
self-recursive compositions in the corpus guard their recursive branch with `Z802`, so a
strict `Z802` would make all of them diverge.

Evaluating arguments eagerly can spend fuel a lazy evaluator would not. That shows up as
fuel exhaustion, which is loud, rather than as a wrong answer, which is not.

## Commands

```sh
make closure            # how far the current primitive set reaches
node scripts/find-expansion-cycles.js   # groups that must be grounded, not expanded
node scripts/export-scheme.js Z38114 --call '"de les chats"'  # self-contained Scheme
make fstar-generate-eval # regenerate the composition bodies from the pinned cache
make fstar-check        # verify every F* module, one process each
make fstar-verify-functions  # verify every function on its own, in parallel
make fstar-engine       # extract to OCaml, compile to JavaScript
make engine-testers     # check against Wikifunctions' own testers
node --test             # includes engine and tester regression tests
```

## Names, and hints inside them

A generated name is the ZID followed by the English label. Only the ZID is the identity;
the rest is a hint for whoever is reading, and it changes when someone relabels the
function on the wiki. So the Scheme listing binds each definition twice — under its full
name and under its bare ZID — and `wikifn-hints.scm` supplies a `wikifn` macro that
rewrites any `Znnnn_...` name in its body down to `Znnnn` before compiling, so you can
write a hint nobody generated:

```scheme
(load "wikifn-hints.scm")
(load "wikifn-bundle.scm")

(Z10627_rot13_latin_alphabet "Hello")          ; the generated name
(Z10627 "Hello")                               ; the identity alone
(wikifn (Z10627_shift_each_letter_by_13 "Hello"))   ; a hint of your own
```

The rewrite happens at expansion time, so a hint costs nothing at run time. Outside
Scheme it is one substitution: `s/\(Z[0-9][0-9]*\)_[A-Za-z0-9_]*/\1/g`.

## Calling it from JavaScript

`make fstar-engine` extracts the F* to OCaml, compiles that, and runs `js_of_ocaml`
twice: `docs/generated/wikifn_engine.cjs` for Node and `wikifn_engine.js` for the browser.
Both export the same two functions, and that is the whole interface. They take and return
strings because that is what crosses the `js_of_ocaml` boundary cleanly.

```js
require("./docs/generated/wikifn_engine.cjs");

// wikifnEngineCall(zid, fuel, jsonArgs) -> JSON string
const out = globalThis.wikifnEngineCall("Z22294", "5000", JSON.stringify(["१२३"]));
// {"ok":true,"zid":"Z22294","fuel":5000,"result":{"type":"Z6","text":"123"}}

// wikifnEngineSource(zid, arity, nameTable) -> JSON string
// Rendered by Wikifn.Print, the same checked module the evaluator uses.
```

`examples/node-engine.js` wraps that for the command line: it prints the declared
signature, the composition as an s-expression, and then the answer.

```sh
node examples/node-engine.js Z10627 "Hello, Wikifunctions!"
node examples/node-engine.js Z22294 "१२३४५"
node examples/node-engine.js Z12668 '[1,2,3]'      # a kernel primitive
node examples/node-engine.js --fuel 500 Z10627 hi  # running out is reported
node examples/node-engine.js --find reverse
```

```text
Z10627  ROT13 (Latin alphabet)
  Z10627K1: String -> String   (declared, not checked)
  from implementation Z13471 revision 133906

(define (Z10627_rot13_latin_alphabet a0) (Z12812_caesar_cipher_latin_alphabet a0 13))

call  Z10627("Hello, Wikifunctions!")  fuel 100000
  {"type":"Z6","text":"Uryyb, Jvxvshapgvbaf!"}
```

Composing two of them is ordinary JavaScript, because once the envelope is unwrapped a
Wikifunctions function is an ordinary call. The classic palindrome is only a palindrome
once the spaces are gone, so it is `Z10096` after `Z10052`:

```sh
node examples/compose.js
```

```text
"a man a plan a canal panama"  literally false  spaces removed "amanaplanacanalpanama"  then true
"amanaplanacanalpanama"        literally true   spaces removed "amanaplanacanalpanama"  then true
```

`Z10096` compares codepoints, so it is case-sensitive: `neveroddoreven` is a palindrome
and `Neveroddoreven` is not. That is what the corpus function does, not a limitation of
this engine. Case folding would be one more composition, `Z10047` to lowercase, which is
not implemented yet.

The browser build of the same artifact drives `docs/demo-engine.html`, which is the
searchable catalogue with a run form.

## What "round trip" does and does not mean

Every emitted body is reported as round-tripping "identical", and that is true of what it
checks: render the tree back to a canonical composition, read it again, and compare. That
is *self-consistency* — it shows this repo's writer and reader agree, and both are this
repo's.

Compared against the pinned composition each body was translated from, **2,816 of 3,890
match and 1,074 differ**. `test/fidelity.test.js` holds that second number and it may only
be lowered. Most of what differs is spelling rather than meaning, because canonical
Wikifunctions has more than one way to write the same thing — but the description "all
back as canonical Wikifunctions compositions" implied the stronger claim, and nothing was
checking it.

## Refusals, as budgets

`test/coverage.test.js` turns every refusal into a named class with a budget rather than a
line in a log. A class that is ours has a budget of zero; a defect in a pinned object is
named separately, because no work here fixes it; and a refusal belonging to no class is
itself a failure.

Skipped translations went from 51 to 7, of which 5 are corpus defects. The four classes
that were ours were the same mistake in different clothes — reading only the literal case
of something that can also be computed: a `Z13518` whose value is a call, a record whose
type is `Z882(Z6, Z6)`, a call whose function is an argument, and a list whose elements
are not constants.

## Known limits

- No references. Arguments are literal values; the engine has no object store, and a
  ZID-shaped string is refused rather than read as text.
- No errors (`Z5`) as values, and no quoting. Records exist now; these do not.
- Implementation choice is made without any notion of correctness. A function can have
  several composition implementations and they are not interchangeable for a tool that
  follows them transitively: ROT13 has one written as thirteen nested rot1 calls that does
  not evaluate here, and `Z844` boolean equality has one defined as not(inequality) while
  `Z10237` inequality is defined as not(equality). The generator translates every
  candidate and prefers one that runs and stays out of a mutual-recursion cycle — but not
  one that gets the right answer. `Z15391 nth Fibonacci number of order k` is a faithful
  translation of an implementation that hardcodes 3 where *k* belongs, so it computes
  tribonacci whatever *k* you pass, and its own testers say so.
- Some cycles cannot be escaped by choosing differently, and are grounded in the kernel
  instead: arithmetic, and reversing and appending a list. That is what the wiki's own
  evaluator does when it prefers a code implementation, so it restores what Wikifunctions
  computes rather than changing it. Each one is named in `Wikifn.Eval` with the reason.
- Deep recursion exhausts fuel before it produces an answer. The evaluator is not
  tail-recursive after extraction.
- One body cannot be checked at all. See the section on splitting above.
- The s-expression printer recurses over the body, so a deep enough body exhausts the
  *JavaScript* stack before F* notices anything. `Z33163` does; it is counted and named
  rather than allowed to end the export.
- `Wikifn.Model.has_type` is still assumed. The catalogue and the listing now carry each
  function's declared argument and return types, read from the pinned `Z8` — but nothing
  checks them, so they are documentation. A wrong one is a wrong comment, not a wrong
  answer.

## What to do next, in order

Ranked by what the measurements say, not by what is interesting. The two counts are
different questions: *testers* is how much evidence a change buys, *closure* is how many
functions it makes reachable at all.

1. **Errors as values, and the functions around them** — `Z5`, `Z851` throw, `Z850`
   try-catch, `Z853` get-error. Closure: 1,456 / 1,383 / 1,293 functions blocked. This is
   also most of what a tester's *validator* needs, and 3,122 tester cases are currently
   skipped because their validator cannot run. Largest single structural unlock.

2. **Quoting** — `Z99` quote, `Z805` reify, `Z899` unquote, `Z29267` quoted reference.
   Closure: 1,450 / 1,320 / 1,454. Needed before any function that manipulates function
   values as data can run.

3. **Teach the tester harness more argument forms** — records, pairs, monolingual text.
   2,926 tester cases are skipped for "argument is not a readable literal" and a further
   519 because `Z889` list equality is given both arguments so no expected value can be
   inferred. This is the single largest bucket and it is a limit of the *harness*, not of
   the engine: it buys evidence about code that already works, with no new semantics to
   get wrong.

4. **Choose implementations by tester agreement.** The corpus already contains the
   evidence — every function's testers — and the generator does not use it. Translating
   every candidate is already done; scoring them against their testers and keeping the
   best is the missing step, and it is what would have caught `Z15391`.

5. **Case mapping** — `Z10047` to lowercase, `Z10018` to uppercase. 146 tester cases,
   1,301 functions blocked. Needs a real Unicode case table; an ASCII-only version would
   be wrong for exactly the inputs the testers use, so it should not be shipped as if it
   were general.

6. **Regular expressions** — `Z12316`, `Z10196`, `Z36900`, `Z11461`. Around 240 tester
   cases. Large and self-contained; worth doing as its own module.

7. **A representation for very large literals.** `Z24460` is unverifiable because its body
   is one 164 KB codepoint list. An F* string literal decoded at load time would fix it,
   at the cost of a change to the value model.

8. **Tail recursion after extraction**, so deep recursion returns an answer instead of
   exhausting fuel.

9. **Write the typing rules.** `has_type` is assumed and the declared types are now
   carried but unchecked. Checking them would turn the demo's "declared, not checked"
   caveat into a guarantee.

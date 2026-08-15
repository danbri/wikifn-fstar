# The Wikifn Engine

1,370 real Wikifunctions compositions compiled into F* functions, checked by F*, and
extracted to OCaml and then JavaScript — plus an interpreter over 3,893 of them, which is
how the rest are reached and how the compiled ones are checked against something.

## What is generated and what is authored

This distinction matters more than any other claim on this page, so it comes first.

**Mechanically generated from the pinned corpus** — no judgement involved, reproducible
by re-running the generator, and stamped with the revision and digest of the source
object:

| file | contents |
|---|---|
| `src/fstar/Wikifn.Compiled.Direct.fst` | **1,370 compositions as F\* functions**, each a translation of a pinned `Z14K2` tree |
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
| **compiled into F\* functions, checked by F\*** | **1,370** |
| carried as data for the interpreter | 3,893 |
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
magnitude: **217 of 3,890 bodies were recursive at all**, 5.7%, and they take the same fuel
parameter the interpreter already uses. The other 94.3% are plain non-recursive
definitions. What had actually blocked the old direct compiler was that it typed every
parameter and return as `text`, gated recursion on the literal string `"Z14613"`, and
refused lists, records and function values.

## Evidence it is right

`make engine-testers` runs every Wikifunctions tester (`Z20`) whose call and expected
value this harness can read:

| | count | was |
|---|---|---|
| testers considered | 10,287 | 10,281 |
| pass | **2,509** | 1,414 |
| fail | 222 | 111 |
| error | 5,851 | 1,594 |
| skipped, with reasons | 1,705 | 7,165 |

| | count | was |
|---|---|---|
| functions with at least one passing tester | 1,078 | 600 |
| functions passing every tester that could be read | **800** | 493 |

A tester is only counted as passing when both its call and its expected value were
readable. Everything else is skipped with a stated reason, never counted as a pass.

Read the error column carefully. It quadrupled in the same change that raised passes from
1,414 to 2,509, and that is not a regression — it is the same cases, differently
classified. The harness learned three things it could not read before, all of them about
arguments rather than about the engine:

- **a record.** The engine prints one as `{"type":…,"fields":{…}}` and parses that form
  back, so a record written in a tester can be handed to it directly.
- **a function reference.** `Z889` list equality takes the element comparator as its third
  argument and nearly every list tester passes `Z866` there; dereferencing it landed on a
  `Z8` that nothing could convert. It is a function value, and the engine has those.
- **an enum member.** `Z16109` is stored as `{Z1K1: Z16098, Z16098K1: "Z16109"}`, exactly
  as `Z41` is `{Z1K1: Z40, Z40K1: "Z41"}`. Following the inner reference builds a tower of
  the same type wrapped around the identity; the reference *is* the value.

Between them that moved about 5,400 cases out of "skipped" and into being run. Most now
report a reason the engine can state — `Z6820` Fetch Wikidata entities has no
implementation, 767 times — where before they were silent. Moving a case from skipped to
error is progress: it is the difference between not knowing and knowing.

The largest remaining buckets are honest limits, not silence:

- 1,407 arguments still cannot be converted, down from 7,165 — mostly generic types
- 811 exhaust fuel and 639 hit the depth limit
- 767 reach `Z6820` Fetch Wikidata entities, which is a data fetch rather than a function
- 292 reach `Z805` reify on a list or a pair, which it refuses because those carry no
  element type — the one real gap left in the value model
- 222 disagree and are worth individual investigation. They are ordinary scalar
  disagreements — a string in, a boolean or a string out — not artefacts of the harness

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

Compared against the pinned composition each body was translated from, **2,858 of 3,890
match and 1,032 differ**. `test/fidelity.test.js` holds that second number and it may only
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

## Errors as values

`Z5` is a type in Wikifunctions: a composition can raise an error, catch one of a
named type, and ask whether a call threw. Until recently this engine had no such value —
an error could only stop evaluation, which is a different thing — so `Z851` throw, `Z850`
try-catch and `Z853` get-error were three of the largest blockers in the closure.

A raised error travels as `EThrown` carrying the `Z5` it was given, so it can be caught,
inspected and returned. All three are *forms* rather than primitives in the interpreter,
because `Z850` and `Z853` have to see whether their argument produced an error rather than
have it propagate past them, and `Z850`'s handler must not run unless it is needed.

In compiled code only `Z850` needs that treatment, and the reason is a property of the
representation rather than a convenience: a compiled function threads `eval_result`, so an
argument that raised is already an `EErr` in hand — which is exactly what try-catch wants
to look at.

`Z29294` object equivalence is grounded on the same structural comparison as `Z13052`
object equality: it has three code implementations on the wiki and no composition, so
following it was never going to reach anything, and its Python is an identity check, a
type check and then a structural comparison.

Closure over the primitives went from 936 functions without recursion to **961**, and from
1,168 with recursion to **1,208**. Compiled F* functions: **1,381**.

## The tester harness was measuring itself

A `Z20` tester's validator is a call with one argument left empty: fill it with the result
and the validator must return true. This harness did not do that. It matched three
validators by name — `Z866`, `Z844`, `Z13522` — pulled the other argument out as a
literal, and compared; every other validator was reported unsupported. That counted 3,445
cases as skipped for a reason about the harness rather than about the engine.

The validator is now *run*, because it is an ordinary function and the engine can call it.
Passing testers went from 1,249 to **1,291**, functions passing every readable tester from
450 to **460**, and functions with at least one pass from 544 to **565**.

## Types are values

`Z4` is a type in Wikifunctions and a type is a value, so a composition can ask what type
something has, build a type to compare against, and render one as text. None of that
worked here: `Z16829` type-of answered only for records, and the generic constructors
`Z881`, `Z882` and `Z883` had no implementation at all, so `Z881(Z6)` — the type "list of
strings" — stopped the evaluation that mentioned it.

Applying a type constructor now yields a record of that type holding its parameters, which
is the shape the corpus writes, and `Z22764` renders it back. The spelling is not a choice:
these are the strings its own testers demand, brackets and nesting included.

```
Z16829("abc")                            -> Z6
Z881(Z40)              rendered          -> "Z881 (Z40)"
Z882(Z6, Z16683)       rendered          -> "Z882 (Z6, Z16683)"
Z882(Z99, Z883(Z6, Z881(Z6)))            -> "Z882 (Z99, Z883 (Z6, Z881 (Z6)))"
```

One limit is real and is the value model's, not this code's: a `VList` and a `VPair` carry
no element type, so the best that can be said of a list of strings is that it is a list.
The corpus writes that parameter and `Z22764`'s testers ask for it back. Carrying type
parameters on lists and pairs is what would close it, and it is also why `Z805` reify
refuses a list or a pair — reify's whole job is to say what something is made of, and for
those two the answer would have to leave out the part that matters.

## Quoting, and taking an object apart

A quote holds an expression rather than a value, so `value` and `expr` in `Wikifn.Eval`
are one mutually recursive family and `VQuote` carries an `expr`. Unquoting is not
unwrapping: `Z899` evaluates the body in the environment the unquote sits in, which is why
it is a form in `eval` rather than an entry in `apply_primitive`.

That also settles how a quote is printed. Scheme's `(quote x)` is a datum and opening it
again would need `eval`, so the listing prints a quote as `(lambda () …)` and the prelude's
unquote calls it. Same semantics, no `eval`, still self-contained.

`Z805` reify takes an object apart into the key-value pairs it is made of, and `Z808`
abstract puts one back together. Wikifunctions has no type system; this pair is what it
uses instead. `Z15818 is Natural number` is written as

```
Z13052(Z811(Z805(x)), Z811(Z805(natural 0)))
```

— reify both, take the first pair of each, compare. That only works if the two agree, so
they are **proved** inverses in `Wikifn.Roundtrip`, for every shape reify answers for,
resting on `Wikifn.Zid.Laws`: a natural, a ZID and a key each read back as themselves after
being written out.

Two side conditions came out of the proof rather than being designed in. Reify refuses a
record whose own fields include `Z1K1`, and one whose type is a scalar's — in both cases
abstract could not tell what it was looking at, and the encoding would not be reversible.
Nothing in the corpus writes either shape.

`Z828` fetch persistent object is still open. What replaced part of it is resolution at
generation time: a bare reference to a persistent object holding a value is read from the
pinned cache and inlined, whatever shape that value has. `Z33395` is the language fallback
table, stored on the wiki as a `Z99`, and `Z24307` reads it with `Z899`; before this the
reference became a call to a function nobody implements and the answer was quietly wrong.

## What a compiler can do that an interpreter cannot

`Z10070 has substring` did not return in ten minutes. Not on a pathological
input — on a 55-character URL.

It reaches `Z28715 index of first sub-list start`, whose composition asks *is the
answer for the tail zero?* and then, if it is not, returns *that same answer plus
one*. Written out as an F\* function, that is two identical recursive calls per
level, and the work doubles per character: on 55 characters, 2^55 calls.

Fuel does not save it. Compiled fuel bounds the **depth** of a recursion, one
level per step, and every one of those 2^55 calls is within depth 55. The
interpreter survives the same composition only because its fuel counts **total
steps**, so it stops and reports exhaustion rather than answering.

The fix is the oldest compiler optimisation there is. Anything computed in a
conditional's condition and again in one of its branches is now computed once
and named:

```fstar
else (let shared_1 = (compiled_Z28715_index_of_first_sub_list_start next_fuel (call_primitive 812 [a0]) a1) in
      let cond_3 : eval_result bool = condition_of 802 (compiled_Z23883_is_zero_natural_number shared_1) in
      match cond_3 with
      | EErr e -> EErr e
      | EOk b -> if b then (EOk (VNat 0))
                 else (call_primitive 13578 [shared_1]))
```

2^n becomes n. **53 of the compiled functions** had a call computed twice like
this.

Binding *at the conditional* is what makes it safe. The condition is evaluated on
every path through it, so naming what it computes adds no evaluation; hoisting
out of a branch would evaluate the recursive call that the branch exists to
guard, and nearly every recursive composition in the corpus is guarded that way.

This is the concrete answer to what extracting *function definitions* buys over
extracting an interpreter. An interpreter cannot do this: it sees a tree, walks
it, and walks the same subtree twice because that is what the tree says. A
compiler sees the whole function at once.

### A conditional written as a function is still a conditional

`Z11542 if string output` is exactly `Z802(K1, K2, K3)`. Compiled as an ordinary
call it becomes strict, so both branches are evaluated — and a recursive
composition guarded by one never reaches its base case. `Z14859 Delannoy number`
guards its three recursive calls with `Z31490 if either`, and never returned.

Where the guard can be put back, it is: a call to a non-recursive function whose
body is headed by a conditional, and whose parameters are each used at most once,
is inlined at the call site so the `if` lands where the corpus meant it.

Where it cannot, the function is left to the interpreter. The generator refuses
any recursive function with no path to an answer that avoids its own group —
because once the guards are strict, that is a function with no base case,
whatever the corpus intended.

This is not only about compilation, and in the interpreter it was giving **wrong
answers**, not slow ones. `Z12899 join list of strings with delimiter` is written
as `Z19565(null?(l), "", …, car(l), …)`, where `Z19565` is a five-argument `if`
written as a function. Every argument evaluated means `car` of the empty list is
taken before the guard can choose, and the interpreter answered *"type mismatch
in Z811"* where the answer is `""`.

So the aliases are put back before either path sees them: when the generator has
translated every body, a call to a non-recursive function whose body is headed by
a conditional is replaced by that body with the arguments substituted in.
**187 bodies** change, and the interpreter's own `Z802` form makes them lazy
again. What is contributable back to Wikifunctions keeps the original — only what
runs here is rewritten.

Measured: testers passing 2,385 → **2,509**, functions passing every readable
tester 771 → **800**. `Z10108 string end padding` stopped throwing
`Maximum call stack size exceeded` at the same time: the overflow was strict
evaluation of a guarded recursive branch, not the depth limit.

### What is left to the interpreter, and why

Sixty functions still do not compile, and none of them is about termination any
more.

- **39 apply a function value.** `Z13318` and its siblings take a function and
  call it. The interpreter can, because it has the policy; `call_primitive`
  cannot, because `apply_primitive` does not know how to call anything. Every one
  of these has a function computed at run time — a statically named one would
  compile, and the corpus never writes one.
- **17 pass a computed function to `map`, `filter`, `fold` or `zip`.** Same gap.
- **4 unquote**, which needs an evaluator, and compiled code has none.

All three want the same thing: a dispatcher reachable from inside a compiled
function. `compiled_by_zid` exists but is defined after everything it selects, so
calling it from within would make the whole module one mutually recursive group —
which is the shape that cannot be checked. Splitting into a module that needs no
dispatch and one that does, layered so the second can call the first's
dispatcher, is the way through; the partition is closed, because anything calling
a function that needs dispatch needs it too.

### The budget counts steps, not depth

That was the deeper problem, and it took three separate hangs to see it. A
compiled function used to take `fuel` and decrement it per level, which bounds
the *depth* of a recursion and nothing else. The interpreter threads one counter
through the whole evaluation, which bounds *total steps*. Anything that branches
is exponential inside a depth bound and finite inside a step bound.

So a recursive compiled function now takes a budget and returns what is left of
it:

```fstar
let rec compiled_Z28715_index_of_first_sub_list_start (fuel:nat) (depth:nat) (a0 a1:eval_result value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases fuel) =
  if fuel = 0 then (EErr EFuelExhausted, 0) else
  if depth >= max_depth then (EErr EDepthExceeded, fuel) else
  let next_fuel : nat = fuel - 1 in
  let deeper : nat = depth + 1 in
  let (spent_1, left_1) = compiled_Z12851_is_longer_list next_fuel deeper a1 a0 in
  ...
```

The refinement is the whole termination argument: a callee cannot hand back more
than it was given, so the next call starts from something no larger, and
`fuel - 1` at the top makes it strictly smaller. F\* discharges it for all 1,370
functions.

One counter is not enough, and trying it is how that was established. Every level
costs at least one step, so a budget the stack can take is also a depth the stack
can take — but a budget that small is a poor bound on *work*. At a threaded
budget of 5,000 with no separate depth limit, **143 compiled calls answered with
a JavaScript stack overflow**, which the sweep caught and named. Steps and
nesting are different questions: fuel is threaded and bounds the total, `depth`
is counted and bounds the nesting, and both are the interpreter's numbers —
100,000 and `max_depth`.

Two places cannot thread. Inside the function a `map`, `filter`, `fold` or `zip`
applies, there is nowhere to carry the remainder, so each element gets a fresh
budget and total work is elements × budget — bounded, and it was never the case
that multiplied. And a call back into the caller's own group from inside such a
lambda gets `next_fuel` rather than a fresh budget, because a fresh one does not
decrease and F\* rightly refuses it.

What this bought: the two refusals above stopped being necessary. `Z14894
Eulerian number`, `Z14859 Delannoy number` and `Z13728 prime divisors` all
compile now, and all report exhaustion rather than running for ever — which is
what the interpreter does with them and therefore what agreement requires.
**Compiled functions: 1,170 → 1,370.**

The guard against it coming back is `scripts/compiled-sweep.js`, run from
`test/compiled.test.js` in a child process with a deadline. It writes which call
it is about to make before making it, so when a call does not return the test
reports the function by name instead of hanging — which is exactly what the
previous version did, in-process, for five minutes. It also fails on a *throw*,
because a throw from a compiled function is a crash rather than a limit.

## Counting what a missing primitive blocks

For a long time this page ranked the remaining primitives by how many functions each one
"blocks", taken from `rankBlockers` in the closure analysis. That number counts a function
once for **every** leaf blocking it, and the leaf sets overlap almost entirely — so four
different primitives each appeared to block about 1,400 of the same functions, and the
ranking was noise.

The honest measure is the *marginal* one: add the primitive, re-run the fixpoint, take the
difference. It is roughly thirty times smaller and it reorders the list.

| | marginal unlock | used to claim |
|---|---|---|
| `Z22764` String from Type | **+49**, done | blocks 1,455 |
| `Z10047`/`Z10018` case conversion | **+41**, done | blocks 1,301 |
| quoting — `Z99`, `Z805`, `Z899`, `Z29267` | **+56**, done | blocks 1,392 |
| `Z27861` HTML raw content to fragment | **+67**, done as a composition | blocks 267 |
| `Z6820` Fetch Wikidata entities | **+316** | blocks 671 |
| `Z828` fetch persistent object | +20 | blocks 1,186 |
| `Z12316` regex substitute with flags | 0, was +45 | blocks 636 |
| `Z10249` K combinator | **0** | blocks 1,263 |

Two rows are the ones to keep in mind. `Z10249` looked like the seventh most valuable thing
to ground and grounding it would change nothing at all, because everything it gates is gated
by something else too. And `Z12316` was worth +45 before quoting landed and is worth nothing
now — the marginal number moves as the frontier does, which is the whole reason to measure
it again rather than to quote it.

The measurement is `node scripts/analyze-closure.js --set engine --marginal 20`. It adds
each candidate to the primitive set, re-runs the fixpoint, and reports the difference. It
counts compositions written in `compositions/` as well, because the engine runs those.

`Z27861` is the shape worth noticing: `Z89` HTML fragment is a type with one string field,
both of the wiki's implementations are code, and the composition that fills the gap is one
record construction. It unlocks 67 functions and adds no semantics at all.

## Known limits

- No object store at run time. Arguments are literal values and a ZID-shaped string is
  refused rather than read as text. A reference *inside a composition* is resolved from the
  pinned cache when the generator translates it, which covers the constants the corpus
  stores as persistent objects — but `Z828` fetch persistent object, which takes a
  reference computed at run time, is still open.
- A list and a pair carry no element type. Reify refuses both rather than answering
  without the part that matters, and `Z22764` cannot render a fully parameterised generic
  from a value.
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
- Two bodies cannot be checked at all: `Z24460` at 166,813 rendered bytes and
  `Z37473` at 94,602. Both are expression trees rather than literals, so there is
  nothing to lift out of them. Every other body that was over the limit is now
  under it — a large literal is given a name at module level and shared, so it is
  checked once instead of landing in every query its body generates.
- Every tool in the chain has a size at which it stops working, and each one
  fails differently: F* OOMs on a module, gives up or overflows on a term, and
  `js_of_ocaml` overflows its stack on a long cons chain with no location at all.
  `.claude/skills/generated-term-size` records the measured limits and what
  actually fixes each one. F* passing proves nothing about `js_of_ocaml`.
- ~~The s-expression printer exhausts the JavaScript stack on a deep enough body.~~ Fixed.
  It was 38 of 3,892 definitions, including `Z33163`, which had been named here as a
  permanent limit. It was not one: `scripts/export-all-scheme.js` now re-execs itself with
  the OS thread stack raised to its hard limit and V8's stack raised to just under it, and
  all 3,892 render. Both limits have to move together — `--stack-size` above the thread
  stack segfaults V8 rather than throwing.
- `Wikifn.Model.has_type` is still assumed. The catalogue and the listing now carry each
  function's declared argument and return types, read from the pinned `Z8` — but nothing
  checks them, so they are documentation. A wrong one is a wrong comment, not a wrong
  answer.

## What to do next, in order

Ranked by what the measurements say, not by what is interesting. The two counts are
different questions: *testers* is how much evidence a change buys, *closure* is how many
functions it makes reachable at all.

1. ~~**Errors as values**~~ — done. `Z5`, `Z851` throw, `Z850` try-catch, `Z853`
   get-error. An error is data a composition can raise, catch and return.

2. ~~**Quoting**~~ — done. `Z99` quote, `Z805` reify, `Z808` abstract, `Z899` unquote,
   `Z29267` quoted reference, with reify and abstract proved inverses.

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

5. ~~**Case mapping**~~ — done. `Z10047` and `Z10018` are the root-locale Unicode
   algorithm in `Wikifn.Unicode.Case`, stored as 205 and 193 runs rather than as
   three thousand pairs, which keeps every term an eighth of the size F* can check.
   Measured unlock: **+41 functions**, not the 1,301 this line used to claim — that
   figure counted a function once per blocking leaf and the leaf sets overlap.

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

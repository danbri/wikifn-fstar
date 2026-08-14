# The Wikifn Engine

An extracted F* interpreter carrying 2,430 real Wikifunctions compositions.

## What is generated and what is authored

This distinction matters more than any other claim on this page, so it comes first.

**Mechanically generated from the pinned corpus** — no judgement involved, reproducible
by re-running the generator, and stamped with the revision and digest of the source
object:

| file | contents |
|---|---|
| `src/fstar/Wikifn.Generated.Eval.fst` | 2,430 composition bodies, each a translation of a pinned `Z14K2` tree |
| `docs/generated/functions.json` | the catalogue: ZID, generated name, label, arity, provenance |
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

## Reach

Measured with `make closure` (a fixpoint over the call graph, not a per-seed walk):

| | count |
|---|---|
| functions in the corpus | 4,970 |
| closing over the engine's primitives, no recursion needed | 417 |
| closing over the engine's primitives, needing recursion | 699 |
| translated into F* and verified | **2,430** |
| of those, runnable today | **431** |
| skipped by the translator, with reasons recorded | 1,476 |

A function is emitted whether or not everything it calls is implemented. Calls
are by reference: the evaluator looks a body up when the call happens, so a
function that reaches a gap still evaluates until it gets there, reports a
missing implementation, and starts working the moment the gap is filled. Only
the runnable count claims anything today.

Recursion is not a barrier for the interpreter: fuel bounds it uniformly, so the 699
recursive functions come along with the rest. Recursion *is* a barrier for compiling a
composition into a standalone F* function, because that needs a termination measure per
function. This is why the interpreter path scales and the direct-compilation path does
not.

## Evidence it is right

`make engine-testers` runs every Wikifunctions tester (`Z20`) whose call and expected
value this harness can read:

| | count |
|---|---|
| testers considered | 7,123 |
| pass | 577 |
| fail | 57 |
| error | 2,127 |
| skipped, with reasons | 4,362 |

| | count |
|---|---|
| functions with at least one passing tester | 263 |
| functions passing every tester that could be read | **211** |

A tester is only counted as passing when both its call and its expected value were
readable. Everything else is skipped with a stated reason, never counted as a pass.

The largest remaining buckets are honest limits, not silence:

- 1,881 testers pass an argument this harness cannot convert to a literal
- 664 exhaust fuel
- 430 use `Z889` list equality with both arguments supplied, so the expected value cannot
  be inferred
- 57 disagree and are worth individual investigation

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
make fstar-check        # verify every F* module
make fstar-engine       # extract to OCaml, compile to JavaScript
make engine-testers     # check against Wikifunctions' own testers
node --test             # includes engine and tester regression tests
```

```js
require("./docs/generated/wikifn_engine.cjs");
const out = globalThis.wikifnEngineCall("Z22294", "5000", JSON.stringify(["१२३"]));
// {"ok":true,"zid":"Z22294","fuel":5000,"result":{"type":"Z6","text":"123"}}
```

## Known limits

- No references. Arguments are literal values; the engine has no object store, and a
  ZID-shaped string is refused rather than read as text.
- No records, errors (`Z5`), or monolingual text as values. These block the largest
  group of skipped testers.
- `Z803` value-by-key, `Z851` throw, `Z805` reify and `Z899` unquote are the four
  highest-value missing primitives.
- Implementation choice matters. A function can have several composition
  implementations and they are not interchangeable for a tool that follows them
  transitively: ROT13 has one written as thirteen nested rot1 calls that does not
  evaluate here, and Z844 boolean equality has one defined as not(inequality)
  while Z10237 inequality is defined as not(equality). The generator translates
  every candidate and prefers the choice that runs and that stays out of a
  mutual-recursion cycle. 64 functions are still left in one; the catalogue and
  the Scheme listing mark them, because a Scheme has no depth guard and will
  overflow rather than report.
- Deep recursion exhausts fuel before it produces an answer. The evaluator is not
  tail-recursive after extraction.
- `Wikifn.Model.has_type` is still assumed. Typing rules are not written.

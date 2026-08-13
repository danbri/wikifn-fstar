---
name: fstar-efficiency
description: Make F* and its extracted OCaml/JavaScript fast, and make graph analysis over the Wikifunctions corpus fast. Use when extracted code is slow, when F* checking is slow, when writing recursive kernel functions, or when computing reachability, closure, or any whole-corpus analysis. Covers unary-recursion traps, repeated subexpressions, memoization in a pure language, and least/greatest fixpoints.
---

# Efficient F* and Efficient Analysis

Two different cost domains get confused. Keep them apart.

1. **Verification time** — how long F* and Z3 take to accept a module.
2. **Runtime** — how long the extracted OCaml or JavaScript takes to compute an answer.

A change can improve one and hurt the other. Always say which one you measured.

## The recurring failure

Every slowness found in this repo so far has the same shape: **recursive code that redoes
work it already did**. It has appeared in the F* kernel, in the generated F*, and in the
JavaScript analysis tooling. Assume it is present until measured otherwise.

## Rule 1: never define arithmetic or equality by unary recursion

This is the single most expensive mistake made here.

```fstar
(* WRONG: costs O(min a b) steps, and extracts to that many bignum operations *)
let rec nat_eq (a:nat) (b:nat) : Tot bool =
  match a, b with
  | 0, 0 -> true
  | 0, _ -> false
  | _, 0 -> false
  | _, _ -> nat_eq (a - 1) (b - 1)

(* RIGHT: decidable equality, extracts to one comparison *)
let nat_eq (a:nat) (b:nat) : Tot bool = a = b
```

Measured effect in `Wikifn.Primitive.Kernel`, with everything else unchanged and F*
still discharging all verification conditions:

| case | before | after |
|---|---|---|
| Z22294 Devanagari, 10 characters | 865 ms | 8 ms |
| Z10627 ROT13, 10 characters | 4,380 ms | 4 ms |
| Z10627 ROT13, 100 characters | 13,712 ms | 17 ms |
| Z10627 ROT13, 822 characters | ~110 s | 45 ms |

Why it was so bad: `Z14613` replaces characters by parking each one on a private-use
marker codepoint near 61,000. Once markers are in the string, every comparison against
one costs about 61,000 unary steps. The unary definition and the marker technique
multiplied.

The same file already used built-in operators for `<`, `<=`, and `>`. Only `nat_eq` was
written unarily, presumably because it looked more primitive. **Looking primitive is not
a goal. Being checked is the goal.** The built-in operators are as verified as the
hand-rolled ones and extract to machine operations.

Check for this pattern whenever you see `Tot` recursion on a `nat` that is not obviously
small.

## Rule 2: bind repeated subexpressions once

```fstar
(* WRONG: the marker is computed twice per recursion level *)
bind_kernel
  (z10075_replace_all_substrings arg0 (z10901_get_first_character arg1)
     (z36070_first_available_private_use_character arg0))
  (fun input_0 -> ... z36070_first_available_private_use_character arg0 ...)

(* RIGHT *)
let marker = z36070_first_available_private_use_character input in
...
```

`Wikifn.Specialized.Compositions` binds it; `Wikifn.Compiled.Compositions` (generated)
does not, and neither does the generated IR, where a duplicated `expr` is a duplicated
evaluation. If a generated function uses an argument expression twice, emit a `let`.

### Duplication under call-by-name is exponential, not doubled

`eval_with_policy` substitutes argument *expressions* into a policy body without
evaluating them first. A body that mentions an argument twice therefore evaluates that
argument twice, and nesting multiplies. `Z11082`'s generated body is
`Z802(Z10008(k1), k2, k1)` — `k1` occurs twice — so nesting `Z11082` inside itself costs
2^depth:

| nesting depth | 18 | 20 | 22 | 24 | 26 |
|---|---|---|---|---|---|
| time | 44 ms | 108 ms | 541 ms | 2,417 ms | 9,790 ms |

Ten seconds for 26 nested "return this string unless it is empty" operations. The growth
is a clean factor of four per two levels.

This is currently masked for the demo functions because the interpreter's hand-written
`Z14613` fast path intercepts before the generated recursive body ever runs. It is
latent, not fixed, and it will surface the moment the generated bodies are actually used.

The machinery to fix it already exists and is unused: `expr` has `EArg` and
`eval_with_policy` carries an `env`. A policy body should reference `EArg i` rather than
inlining argument expressions into the body.

Pick the evaluation strategy deliberately:

- **Call-by-name** (what happens today): substitute the argument expression. Correct,
  exponential.
- **Call-by-value**: evaluate every argument before entering the body. Kills the blowup
  but is a real semantic change — an argument that errors or does not terminate now
  matters even when the body never uses it.
- **Call-by-need**: evaluate each argument at most once, on first use, and keep the
  result. For a pure, deterministic, effect-free language — which this is — call-by-need
  is observationally equivalent to call-by-name. It kills the blowup and changes no
  answers. This is the right default here, and it is the threaded-memo-table technique
  from the memoization section applied to the environment.

Do not confuse this with the laziness of `Z802`. Branch laziness is about the *body*;
argument sharing is about the *arguments*. `eval_with_policy` already evaluates only the
taken branch of `FZ802`, and that must stay: 230 of the 288 directly self-recursive
composition implementations in the corpus guard their recursive branch with `Z802`, so a
strict `Z802` would make all of them diverge. The corpus settles that question on its
own; do not appeal to the JavaScript evaluator in `src/junk-proof-of-concept-evaluator.js`
for evidence about Wikifunctions semantics, as it is a three-builtin toy.

### Related traps when the input is text

The same class of problem is what makes naive parsers over `list codepoint` scale badly:

- Building output with `acc @ [c]` per character is O(n²). Accumulate reversed and
  reverse once at the end.
- Re-scanning from the start of the input at each step is O(n²). Carry the position.
- Decoding to a list, then re-encoding, then decoding again across a boundary multiplies
  allocation. Decode once at the edge and keep the internal representation.

## Rule 3: know what your representation costs

`type text = list codepoint` means every operation is a traversal and every result is a
fresh allocation. That is fine for a specification and it is what makes proofs readable.
It is not fine for a library people load in a browser.

Before optimising the representation, fuse the passes. `Z14613` currently makes two
full replace-all passes per alphabet character — 104 passes over the string for ROT13.
The same function as a single map with a lookup over the alphabet is one pass. Change
the algorithm before changing the data structure.

If the representation does become the bottleneck, `FStar.Seq` and Low* buffers are the
next steps, but they change the proof style, so do it deliberately and in a separate
module rather than by degrading the specification modules.

## Rule 4: prefer structural termination over a fuel counter

```fstar
(* Fuel: an extra parameter, an extra failure case, and no relation to the data *)
let rec f (fuel:nat) (s:text) : Tot (kernel_result text) (decreases fuel) =
  match fuel with 0 -> KErr KFuelExhausted | _ -> ...

(* Structural: terminates because the list shrinks; total, no failure case *)
let rec f (s:text) : Tot text (decreases s) =
  match s with [] -> [] | head :: tail -> head :: f tail
```

Fuel is required when the recursion is not structural — a general interpreter over
arbitrary compositions genuinely needs it. It is not required merely because the
function is recursive. Every avoidable fuel parameter adds a runtime failure mode that
callers must handle and that a user of the library will eventually hit.

Where fuel is genuinely needed, derive it from the data rather than accepting a magic
number: `text_replace_all` correctly uses `text_length input + 1`.

## Memoization in a pure language

F* has no mutable cache, so the JavaScript reflex of "wrap it in a Map" does not
transfer. In order of preference:

1. **Restructure so the work is not repeated.** Most apparent memoization needs are
   really repeated-subexpression or repeated-traversal problems. Fix those first
   (Rules 1 and 2).

2. **Accumulator passing / fold.** Carry the partial answer forward instead of
   recomputing it. This turns tree recursion into a single traversal and usually makes
   the termination argument simpler too.

3. **Precomputed table passed as an argument.** For a character map, build the alphabet
   pairing once and pass it down, rather than re-deriving it at each level. An
   association list is acceptable for small tables; `FStar.Map` for larger ones.

4. **Thread the memo table through the return value.** A pure memo is a function
   `a -> table -> (b * table)`. Verbose but honest, and it is the only form that keeps
   the caching inside the verified core.

5. **Memoise after extraction, in the OCaml runner.** Only for a function that is
   genuinely pure, where the cache cannot be observed. This moves the optimisation
   outside what F* checked, so it must be stated plainly wherever the artifact's
   guarantees are described. Do not do this to hide an algorithmic problem.

## Fixpoints, not per-seed traversals

For reachability, closure, or "which functions bottom out in this set" questions, never
run a separate tree walk per seed. The subtrees overlap heavily and an unmemoized walk
re-explores them, which is how `analyzeSeeds` in `src/composition-analysis.js` became
unable to finish a whole-corpus sweep at all. The same question as a fixpoint over the
call graph takes **865 ms** for 4,970 functions (`scripts/analyze-closure.js`).

**Least fixpoint** — start empty, grow. Nothing enters on the strength of its own
membership, so recursive definitions never close. Use this for "what can I translate
without needing a termination argument".

```
closed := primitives
repeat until stable:
  for each function f not in closed:
    if some implementation of f has all callees in closed: add f
```

**Greatest fixpoint** — start with everything, shrink. Survivors may depend on
themselves. Use this for "what closes if recursion is allowed".

```
closed := all functions with a usable implementation
repeat until stable:
  for each f in closed:
    if no implementation of f has all callees in closed: remove f
```

Reporting both numbers separately is the point: the difference is exactly the set that
needs termination measures before F* will accept it. For this corpus, 252 against 177.

Writing such a fixpoint in F* itself: iterate on the set and give `decreases` the size
of the complement (least fixpoint) or the size of the set (greatest fixpoint). Both
measures decrease strictly on every round that changes anything, so the loop is `Tot`.

## Verification-time cost

Runtime fuel and SMT fuel are different things and this repo has both. Do not confuse
them in code, comments, or reports.

- `--fuel` / `--ifuel` control how far Z3 unrolls recursive definitions and inductives
  while proving. Raising them can turn a fast failure into a slow failure.
- A `fuel` function parameter is part of the program's runtime semantics.

Practical measures:

- `--cache_checked_modules` is already in `scripts/fstar-check.sh`. Keep the `.checked`
  files current or every run pays full cost.
- `assert_norm` on a large term is evaluated at check time. Example lemmas over long
  codepoint lists are expensive; keep them short or state them over a small witness.
- If a proof is slow, try lowering `ifuel` before raising `z3rlimit`. A proof that needs
  a large rlimit is usually a proof that needs restructuring.
- Split slow modules. Verification cost is superlinear in module size.

## Measure before and after

Timing the extracted artifact directly, which is what produced the table above:

```sh
node -e "
require('./docs/generated/wikifn_call_browser.js');
const t=(l,f)=>{const s=Date.now();f();console.log(l, Date.now()-s+'ms');};
t('rot13 100', ()=>globalThis.wikifnFstarCall('specialized','Z10627',500,'a'.repeat(100),''));
"
```

Vary one dimension at a time — input length, alphabet size, presence of the marker path.
The marker comparison above was found by noticing that functions not using `Z14613` ran
in 2–10 ms while functions using it took seconds.

After any change to `src/fstar/`, all three must pass before claiming an improvement:

```sh
make fstar-check                  # F* still discharges every condition
make fstar-call-browser           # artifacts rebuilt from the changed F*
node --test                       # including the tester-agreement tests
```

Never report a speedup measured against a stale artifact.

## Checklist

- [ ] Is any `nat` or `codepoint` operation defined by unary recursion?
- [ ] Is any subexpression evaluated more than once because it was inlined?
- [ ] How many passes over the input does this make, and does it need them?
- [ ] Is the fuel parameter necessary, or is the recursion structural?
- [ ] Is this a per-seed traversal that should be one fixpoint?
- [ ] Did I re-run `make fstar-check` and the tests after the change?
- [ ] Did I state whether I measured verification time or runtime?

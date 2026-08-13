# wikifn-fstar

Prototype for analyzing Wikifunctions ZObjects as revision-pinned data and identifying composition-closed functions that could be checked against an F* semantics.

The runnable code is under `src/`. It currently provides:

- canonical ZObject parsing and normalization
- basic structural checks
- revision-pinned snapshot import
- a small fuelled evaluator for `Z14K2` compositions
- a corpus analyzer for existing `Z14K2` implementations and their unverified dependency frontier

## Commands

```sh
npm test
node ./bin/wikifn.js eval-example
node ./bin/wikifn.js analyze-demo
node ./bin/wikifn.js analyze Z22294
make fstar-check
```

`make fstar-check` expects `FSTAR=/path/to/fstar.exe`, `fstar.exe`/`fstar` on `PATH`, or an opam switch named `fstar`.

`analyze` fetches seed functions and their listed implementations by default. Use `--follow-calls` only when you intentionally want to expand calls inside compositions, and keep `--max-objects` bounded.

## Local Toy Example

`node ./bin/wikifn.js eval-example` does not fetch Wikifunctions. It evaluates the local fixture in `examples/add-snapshot.json` and `examples/add-call.json`.

The fixture defines a small recursive composition for `Z781/add`:

```text
add(x, y) =
  if is_zero(y)
  then x
  else add(successor(x), predecessor(y))
```

The call file asks for `add(2, 2)`. The result:

```json
{ "Z1K1": "Z10", "Z10K1": "4" }
```

means "a `Z10` natural number whose stored value is the string `4`".

## Scope

The proof target is not arbitrary Python or JavaScript `Z16` code. The initial target is:

```text
Wikifunctions canonical JSON
  -> pinned ZObject world
  -> composition-closed Z14K2 graph
  -> verified F* semantics / extracted evaluator
```

Foreign implementations and unverified builtins are reported as explicit frontier items.

Setup skills live under `skills/`, including `setup` and `fstar-env`.

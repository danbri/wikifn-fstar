# wikifn-fstar

Prototype for analyzing Wikifunctions ZObjects as revision-pinned data and identifying composition-closed functions that could be checked against an F* semantics.

The runnable code is under `src/`. It currently provides:

- canonical ZObject parsing and normalization
- basic structural checks
- revision-pinned snapshot import
- a junk proof-of-concept fuelled evaluator for `Z14K2` compositions
- a corpus analyzer for existing `Z14K2` implementations and their unverified dependency frontier
- a small F*-extracted composition interpreter over selected pinned composition paths
- direct F* specializations for the same selected closed composition paths

## Commands

```sh
npm test
node ./bin/wikifn.js eval-example
node ./bin/wikifn.js analyze-demo
node ./bin/wikifn.js analyze Z22294
node ./bin/wikifn.js cache stats
make import-vendored-dump
node ./bin/wikifn.js db build
node ./bin/wikifn.js db stats
make fstar-generate-compositions
make fstar-js-demo
node ./bin/wikifn.js fstar-demo
make fstar-browser-demo
make download-dump
node ./bin/wikifn.js cache import-xml <pages-meta-current.xml.bz2>
make fstar-check
```

`make fstar-check` expects `FSTAR=/path/to/fstar.exe`, `fstar.exe`/`fstar` on `PATH`, or an opam switch named `fstar`.

`analyze` fetches seed functions and their listed implementations by default. Use `--follow-calls` only when you intentionally want to expand calls inside compositions, and keep `--max-objects` bounded.

Fetched or dump-imported Wikifunctions objects are cached under `cache/wikifunctions/` by default. The cache stores canonical JSON by ZID and revision with a digest. By default the CLI uses the local cache for analysis; use `--live` or `--refresh-cache` when you intentionally want public API access, and `--no-cache` to bypass the cache.

The repo vendors one dated Wikifunctions current-pages dump under `third_party/wikifunctions-dumps/`. Run `make import-vendored-dump` after checkout to populate the local cache without touching Wikimedia servers. Run `make download-dump` only when intentionally refreshing from Wikimedia.

`node ./bin/wikifn.js db build` creates a derived SQLite index at `cache/wikifunctions.sqlite`. It indexes object provenance, functions, implementations, composition-call edges, dynamic calls, reference edges, labels, descriptions, and primitive grounding status.

`make fstar-js-demo` and `make fstar-browser-demo` are actual F* extraction paths for the checked primitive modules, a small selected-composition interpreter, and direct specialized F* functions for the selected closed paths. F* verifies/extracts OCaml, OCaml compiles to bytecode, and `js_of_ocaml` emits JavaScript under `docs/generated/`. This path can run generated selected F* IR examples and direct specializations, including `Z22294`; it does not yet adapt arbitrary canonical ZObjects at runtime.

`make fstar-generate-compositions` regenerates `src/fstar/Wikifn.Generated.Compositions.fst` from selected pinned objects in the local cache. The generated file is tracked so extraction works from a clean checkout; regeneration is for refreshing or auditing the selected paths.

`node ./bin/wikifn.js fstar-demo` runs the generated Node artifact directly. It is the current honest CLI entry point for the F*-extracted selected-composition demo.

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

In plain terms: `successor(n)` means "the next number after `n`", and `predecessor(n)` means "the number just before `n`". The demo adds by moving one count at a time from the second argument to the first:

```text
add(2, 2)
add(3, 1)
add(4, 0)
4
```

The current runnable interpreter for this is the deliberately named junk JavaScript proof of concept. The F* files are the beginning of the checked model and primitive kernel that a real extracted interpreter should use.

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

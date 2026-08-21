# wikifn-fstar

Prototype for analyzing Wikifunctions ZObjects as revision-pinned data and identifying composition-closed functions that could be checked against an F* semantics.

The runnable code is under `src/`. It currently provides:

- canonical ZObject parsing and normalization
- basic structural checks
- revision-pinned snapshot import
- a junk proof-of-concept fuelled evaluator for `Z14K2` compositions
- a corpus analyzer for existing `Z14K2` implementations and their unverified dependency frontier
- a small F*-extracted composition interpreter over selected pinned composition paths
- generated direct F* functions for the same selected pinned composition paths
- hand-maintained direct F* specializations for the same selected paths

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
make fstar-call-js
node ./bin/wikifn.js fstar-call --mode compiled Z22294 १२३
node ./bin/wikifn.js fstar-eval-json '{"call":"Z22294","args":["१२३"]}'
node ./bin/wikifn.js fstar-eval-json '{"call":"Z13676","args":[{"nat":99},{"nat":42}]}'
node ./bin/wikifn.js fstar-eval-zobject '{"Z1K1":"Z7","Z7K1":"Z22294","Z22294K1":"१२३"}'
make fstar-call-browser
make fstar-browser-demo
make download-dump
node ./bin/wikifn.js cache import-xml <pages-meta-current.xml.bz2>
make fstar-check
make site-stats
```

`make fstar-check` expects `FSTAR=/path/to/fstar.exe`, `fstar.exe`/`fstar` on `PATH`, or an opam switch named `fstar`.

`npm test` needs the local object cache, so run `make import-vendored-dump` after a fresh checkout. Six tests compare what this repo emits against the pinned original it was translated from, and they fail rather than skip when there is nothing to compare against. `.github/workflows/test.yml` runs the same two commands on every push and pull request.

`make site-stats` regenerates the counts on the homepage from the committed artifacts under `docs/generated/`. Every number on `docs/index.html` is generated - editing one by hand fails `test/site-stats.test.js`. `make docs` runs it first. The counts come from `closure-summary.json` (corpus size and closure), `functions.json` (translated, compiled, runnable), `tester-report.json` (what passes Wikifunctions' own testers), and `wikifn-compositions.json` (what was rendered back); refresh `closure-summary.json` with `make closure`, which needs the SQLite index.

`analyze` fetches seed functions and their listed implementations by default. Use `--follow-calls` only when you intentionally want to expand calls inside compositions, and keep `--max-objects` bounded.

Fetched or dump-imported Wikifunctions objects are cached under `cache/wikifunctions/` by default. The cache stores canonical JSON by ZID and revision with a digest. By default the CLI uses the local cache for analysis; use `--live` or `--refresh-cache` when you intentionally want public API access, and `--no-cache` to bypass the cache.

The repo vendors one dated Wikifunctions current-pages dump under `third_party/wikifunctions-dumps/`. Run `make import-vendored-dump` after checkout to populate the local cache without touching Wikimedia servers. Run `make download-dump` only when intentionally refreshing from Wikimedia.

`node ./bin/wikifn.js db build` creates a derived SQLite index at `cache/wikifunctions.sqlite`. It indexes object provenance, functions, implementations, composition-call edges, dynamic calls, reference edges, labels, descriptions, and primitive grounding status.

`make fstar-js-demo` and `make fstar-browser-demo` are actual F* extraction paths for the checked primitive modules, a small selected-composition interpreter, generated direct F* functions, and hand-maintained direct specialized F* functions for the selected closed paths. F* verifies/extracts OCaml, OCaml compiles to bytecode, and `js_of_ocaml` emits JavaScript under `docs/generated/`. This path can run generated selected F* IR examples, generated compiled examples, and direct specializations, including `Z22294`, `Z22649`, `Z27053`, `Z10627`, and `Z19612`. The interpreter includes a checked fast path for `Z14613` character-set replacement; it does not yet adapt arbitrary canonical ZObjects at runtime.

`make fstar-generate-compositions` regenerates `src/fstar/Wikifn.Generated.Compositions.fst` and `src/fstar/Wikifn.Compiled.Compositions.fst` from selected pinned objects in the local cache. The generated files are tracked so extraction works from a clean checkout; regeneration is for refreshing or auditing the selected paths.

`node ./bin/wikifn.js fstar-demo` runs the generated Node artifact directly. It is the current honest CLI entry point for the F*-extracted selected-composition demo.

`node ./bin/wikifn.js fstar-call` runs a callable `js_of_ocaml` artifact linked against the extracted F* modules. It currently dispatches the selected text functions `Z10052`, `Z10627`, `Z11082`, `Z19612`, `Z21679`, `Z22294`, `Z22649`, `Z27053`, and `Z38114` through one of three paths: `generated` F* IR interpreted by extracted F*, `compiled` generated direct F*, or `specialized` hand-maintained direct F*. It accepts UTF-8 text arguments and returns JSON.

`node ./bin/wikifn.js fstar-eval-json` sends a small runtime JSON expression IR to the extracted F* composition interpreter. The IR supports text strings, `{ "codepoints": [...] }`, `{ "bool": true }`, `{ "nat": 123 }`, `{ "arg": 0 }`, and `{ "call": "Z22294", "args": [...] }`, with an optional top-level `fuel`. It now includes grounded scalar calls for string equality/concat/starts-with/length, boolean logic, and several natural-number comparisons/arithmetic operations. This is not yet a canonical ZObject runtime importer.

`node ./bin/wikifn.js fstar-eval-zobject` accepts a supported canonical-style `Z7` call object and lowers it to the same extracted F* evaluator. This is a first runtime adapter for selected calls and value forms, not a full structural verifier for arbitrary ZObjects.

`make fstar-call-browser` emits standalone `docs/generated/wikifn_call_browser.js`, which exports `wikifnFstarCall(mode, zid, fuel, arg0, arg1)` in the browser from the same extracted F*/OCaml modules. `make fstar-browser-demo` also exports that browser call API from `docs/generated/wikifn_primitives_browser.js`; the GitHub Pages demo loads only that combined artifact to avoid loading two `js_of_ocaml` runtimes on one page.

The project homepage is a static overview. Browser-side running demos are split up from `docs/demos.html` / `https://danbri.github.io/wikifn-fstar/demos.html`. The clearest current end-to-end browser demo is `docs/demo-z22294.html`, which runs a selected pinned `Z22294` composition through F* -> OCaml -> JavaScript.

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

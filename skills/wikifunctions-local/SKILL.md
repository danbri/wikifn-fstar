---
name: wikifunctions-local
description: Work with this repo's local Wikifunctions dump, file cache, SQLite index, and F* extraction demos. Use when importing dumps, querying composition graphs, analyzing local ZObjects, or preparing honest demos from F*-checked artifacts.
---

# Wikifunctions Local Corpus

Use this skill for local-first Wikifunctions work in `wikifn-fstar`.

## Ground Rules

1. Do not crawl Wikifunctions or Wikidata for broad analysis.
2. Prefer the vendored dump and local cache.
3. Treat the SQLite DB as derived data, not the source of truth.
4. Do not present the JavaScript composition evaluator as an F* artifact.
5. A demo is F*-grounded only if the executable artifact is actually generated from F* extraction or checked against F* semantics.

## Local Data Flow

```text
third_party/wikifunctions-dumps/<date>/*.xml.bz2
  -> node ./bin/wikifn.js cache import-xml
  -> cache/wikifunctions/objects/<ZID>/<revision>.json
  -> node ./bin/wikifn.js db build
  -> cache/wikifunctions.sqlite
```

The current vendored dump is:

```text
third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2
bytes: 16945649
md5: 03eee30b1bea2e5c38aceba5aa396ce5
```

Import it without network access:

```sh
make import-vendored-dump
```

Build the derived SQLite graph/index:

```sh
node ./bin/wikifn.js db build
node ./bin/wikifn.js db stats
```

`db build` is graph-only by default. Use this only when intentionally materializing all-functions closure status:

```sh
node ./bin/wikifn.js db build --analyze
```

Learning from the first full run: naive all-functions closure materialization over the full dump was too slow to be the default. Keep it explicit until the analyzer is memoized.

## Inspecting Dumps

Plain `bunzip2 file.bz2` expands in place and removes the compressed file.

Use this instead:

```sh
bunzip2 -c third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2 | more
```

or:

```sh
bzip2 -dc third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2 | sed -n '1,80p'
```

Expanded XML dump files under `third_party/wikifunctions-dumps/` are ignored because they are too large for normal GitHub storage.

## Useful SQLite Queries

Implementation body kinds:

```sh
node ./bin/wikifn.js db query --format table \
  "select body_kind, count(*) from implementations group by body_kind order by count(*) desc"
```

Composition calls made by one implementation:

```sh
node ./bin/wikifn.js db query --format table \
  "select from_impl_zid, to_function_zid, path from composition_calls where from_impl_zid = 'Z22295'"
```

Find English labels:

```sh
node ./bin/wikifn.js db query --format table \
  "select zid, text from labels where lang_zid = 'Z1002' and text like '%Sainte%'"
```

Keep recursive SQL bounded and seed-specific. A first unbounded recursive CTE over the full composition graph was too slow for interactive use. Use SQLite for local inspection and small graph traversals; use a memoized analyzer for whole-corpus closure/depth ranking.

## F* Extraction Status

The current honest extraction target is tiny:

```sh
make fstar-js-demo
make fstar-browser-demo
```

This verifies/extracts `src/fstar/Wikifn.Primitives.fst` to OCaml, compiles repo-owned OCaml runners, and invokes `js_of_ocaml`. It is not yet the Wikifunctions interpreter.

Runtime check:

```sh
node docs/generated/wikifn_primitives_demo.cjs
```

Browser-artifact smoke check can use a minimal DOM shim in Node. It must confirm that `docs/generated/wikifn_primitives_browser.js` appends the expected JSON lines to `#fstar-extraction-output`; otherwise do not claim the web demo works.

Known issue from an earlier failed path: generated JS can fail on F*/OCaml runtime primitives such as `caml_thread_initialize` and Zarith primitives unless the right runtime stubs are linked or the extracted code avoids those dependencies. Record the exact failure rather than claiming a browser demo works.

KaRaMeL/Low* C extraction is not configured in the main `fstar` opam switch. Earlier installation failed because the opam `karamel` package wanted an older F*/OCaml stack. Use a separate extraction switch or container for Low* work.

## Expected Report

When done, report:

- whether the vendored dump imported
- cache object/revision counts
- SQLite DB path and counts
- exact F* extraction/build/runtime status
- any live network access used

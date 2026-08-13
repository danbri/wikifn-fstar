# Wikifunctions Cache

The local cache is meant to make analysis repeatable and polite.

Default location:

```text
cache/wikifunctions/
```

Layout:

```text
manifest.json
objects/Z22294/214920.json
objects/Z22295/164133.json
```

Each object file contains:

- ZID
- MediaWiki revision
- timestamp and user from revision metadata
- SHA-256 digest of the canonical JSON payload
- canonical JSON

## Commands

```sh
make download-dump
make import-vendored-dump
node ./bin/wikifn.js cache stats
node ./bin/wikifn.js cache fetch --follow-calls --max-objects 500 --max-network-objects 100 Z22294
node ./bin/wikifn.js analyze --follow-calls --max-objects 500 Z22294
node ./bin/wikifn.js cache import /path/to/zobjectcache --limit 1000
node ./bin/wikifn.js cache import-xml cache/dumps/wikifunctionswiki/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2
node ./bin/wikifn.js cache import-xml third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2
node ./bin/wikifn.js cache import-xml third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2 --limit 10 --cache-dir tmp/smoke-cache
node ./bin/wikifn.js db build
node ./bin/wikifn.js db build --analyze
node ./bin/wikifn.js db stats
node ./bin/wikifn.js db query --format table "select body_kind, count(*) from implementations group by body_kind"
```

## Modes

- default for `analyze`: local cache only
- `--live`: trust cached latest revisions and fetch only missing ZIDs
- `--refresh-cache`: check live revision IDs before fetching
- `--offline`: fail on cache misses
- `--no-cache`: bypass the cache

## Bulk Material

For larger local corpora, prefer bulk sources over crawling. Useful upstream paths:

- Wikifunctions public API `wikilambda_fetch`, including revision-pinned requests.
- Wikimedia content exports from `dumps.wikimedia.org`.
- Wikimedia's `wikifunctions-content-download` workflow, which produces a `Z0.json` revision index and versioned `ZID.revision.json` object files.

The current repo cache layout is close to the `wikifunctions-content-download` versioned-file model. `node ./bin/wikifn.js cache import` supports the common `Z0.json` plus `ZID.revision.json`/`ZID.revision.done.json` layout.

The Wikimedia `pages-meta-current.xml.bz2` dump stores current ZObject page text as escaped JSON in `<text>` for pages whose revision `<model>` is `zobject`. `node ./bin/wikifn.js cache import-xml` streams that dump and imports main-namespace `Z...` pages into the local cache.

The repo vendors one dated current-pages snapshot at `third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2`. `make import-vendored-dump` verifies its MD5 and imports it into `cache/wikifunctions/`.

To inspect the dump without replacing the `.bz2` file:

```sh
bunzip2 -c third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2 | more
```

Plain `bunzip2 file.bz2` expands the dump in place and removes the compressed file. Expanded XML dump files under `third_party/wikifunctions-dumps/` are ignored because they are too large for normal GitHub storage.

`make download-dump` downloads the latest Wikifunctions `pages-meta-current.xml.bz2` dump into `cache/dumps/wikifunctionswiki/<date>/` and verifies the file against Wikimedia's MD5 checksum list. Use it only when intentionally refreshing the local snapshot.

## SQLite Index

The SQLite index is derived data. The source of truth remains the cache JSON files and the vendored dump.

Default path:

```text
cache/wikifunctions.sqlite
```

Build it with:

```sh
node ./bin/wikifn.js db build
```

Useful local queries:

```sh
node ./bin/wikifn.js db query --format table "select body_kind, count(*) from implementations group by body_kind"
node ./bin/wikifn.js db query --format table "select from_impl_zid, to_function_zid, path from composition_calls where from_impl_zid = 'Z22295'"
node ./bin/wikifn.js db query --format table "select zid, text from labels where lang_zid = 'Z1002' and text like '%Sainte%'"
```

The schema includes `objects`, `functions`, `function_implementations`, `function_testers`, `implementations`, `composition_calls`, `dynamic_calls`, `reference_edges`, `labels`, `descriptions`, `primitives`, `analysis`, `analysis_frontier`, `metadata`, and `index_errors`.

`db build` is graph-only by default. `db build --analyze` also tries to materialize whole-corpus composition-closure status; this is useful, but slower, and needs a more memoized implementation before it should be the default on the full dump.

Keep recursive SQL bounded and seed-specific. An unconstrained recursive CTE over all 24k composition-call edges is too heavy for casual use; use SQLite for local inspection and small traversals, or implement memoized graph analysis in JavaScript for whole-corpus closure/depth ranking.

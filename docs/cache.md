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
node ./bin/wikifn.js cache stats
node ./bin/wikifn.js cache fetch --follow-calls --max-objects 500 --max-network-objects 100 Z22294
node ./bin/wikifn.js analyze --offline --follow-calls --max-objects 500 Z22294
node ./bin/wikifn.js cache import /path/to/zobjectcache --limit 1000
```

## Modes

- default: trust cached latest revisions and fetch only missing ZIDs
- `--refresh-cache`: check live revision IDs before fetching
- `--offline`: fail on cache misses
- `--no-cache`: bypass the cache

## Bulk Material

For larger local corpora, prefer bulk sources over crawling. Useful upstream paths:

- Wikifunctions public API `wikilambda_fetch`, including revision-pinned requests.
- Wikimedia content exports from `dumps.wikimedia.org`.
- Wikimedia's `wikifunctions-content-download` workflow, which produces a `Z0.json` revision index and versioned `ZID.revision.json` object files.

The current repo cache layout is close to the `wikifunctions-content-download` versioned-file model. `node ./bin/wikifn.js cache import` supports the common `Z0.json` plus `ZID.revision.json`/`ZID.revision.done.json` layout.

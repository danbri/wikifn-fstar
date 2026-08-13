# Local Setup

This repo does not require Codex, Claude Code, or an agent runtime.

## Requirements

- Node.js 20 or newer
- opam
- Z3
- F* installed through opam or exposed with `FSTAR=/path/to/fstar.exe`

## Commands

```sh
git clone https://github.com/danbri/wikifn-fstar.git
cd wikifn-fstar
make setup-fstar
make doctor
```

`make setup-fstar` uses an opam switch named `fstar` by default. Override it with:

```sh
OPAM_SWITCH=my-switch make setup-fstar
```

## Checks

```sh
npm test
node ./bin/wikifn.js eval-example --trace --profile
node ./bin/wikifn.js analyze Z22294
node ./bin/wikifn.js cache stats
make fstar-check
```

`analyze` fetches only seed functions and their listed implementations unless `--follow-calls` is passed. Keep `--max-objects` bounded when following calls.

## Cache

The default cache is `cache/wikifunctions/`.

```sh
node ./bin/wikifn.js cache stats
node ./bin/wikifn.js cache fetch --follow-calls --max-objects 500 --max-network-objects 100 Z22294
node ./bin/wikifn.js analyze --offline --follow-calls --max-objects 500 Z22294
```

Cache modes:

- default: trust cached latest revisions and fetch only misses
- `--refresh-cache`: check current revision IDs and fetch changed objects
- `--offline`: use only the cache
- `--no-cache`: bypass cache

`--max-objects` caps the analysis corpus. `--max-network-objects` caps new full-object network fetches; cache hits do not count against it.

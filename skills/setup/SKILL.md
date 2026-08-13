---
name: setup
description: Set up this Wikifunctions/F* repository for development, verification, corpus analysis, and agent work. Use when preparing a new machine, CI image, Codespace, or agent session with F*, OCaml/opam, Z3, Node.js, Wikifunctions API access, Wikidata query tooling, local tests, and vendoring/license policy.
---

# Setup

Bring the repo to a state where `npm test`, `node ./bin/wikifn.js analyze-demo`, and `make fstar-check` can run or fail with a precise missing-tool diagnosis.

## Workflow

1. Inspect the checkout:

```sh
pwd
rg --files
git status --short
```

2. Check local tools:

```sh
node --version
npm --version
opam --version
z3 --version
command -v fstar.exe || command -v fstar || true
```

3. Prepare F*:

- Prefer an opam switch named `fstar` for this repo.
- Ensure the switch exposes `fstar.exe` or `fstar` and `z3`.
- If F* is installed elsewhere, set `FSTAR=/absolute/path/to/fstar.exe`.
- Verify with `make fstar-check`.
- For detailed F* diagnosis, use `skills/fstar-env/SKILL.md`.

Useful checks:

```sh
opam switch list
opam exec --switch=fstar -- fstar.exe --version
opam exec --switch=fstar -- z3 --version
```

4. Prepare Node:

```sh
npm test
node ./bin/wikifn.js eval-example
```

This project should not need `npm install` unless dependencies are later added.

5. Check Wikifunctions access:

```sh
make import-vendored-dump
node ./bin/wikifn.js analyze-demo
node ./bin/wikifn.js db build
node ./bin/wikifn.js db stats
```

Prefer the vendored dump and local cache. Use `wikilambda_fetch` for canonical ZObjects and `action=query&prop=revisions` for revision pins only when intentionally refreshing from the live service. Treat live ZIDs as mutable until pinned by revision and digest.
Keep live analysis bounded. The CLI does not follow calls inside compositions unless `--follow-calls` is passed; use that only with an explicit `--max-objects` limit.

6. Check Wikidata access when needed:

```sh
curl -sG 'https://query.wikidata.org/sparql' \
  -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=SELECT ?item WHERE { VALUES ?item { wd:Q81068 } }'
```

Use a clear User-Agent for sustained or scripted Wikidata queries. Cache fetched data under `tmp/` unless the artifact is intentionally part of the repo.

## Dependency Policy

- Keep project implementation code under `src/`.
- Put intentional vendored code under `third_party/`.
- Do not add AGPL dependencies.
- Record URL, version/commit, license, and local changes for any vendored item.
- Prefer no runtime dependencies until the need is concrete.

## Expected Output

When setup is complete, report:

- Node and npm versions.
- F* and Z3 versions, or the exact missing path/tool.
- `npm test` result.
- `make fstar-check` result.
- Whether `make import-vendored-dump`, `analyze-demo`, and `db build` work locally.

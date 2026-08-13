---
name: fstar-env
description: Set up or repair the F*, opam, OCaml, and Z3 environment for wikifn-fstar. Use when fstar.exe/fstar is missing, make fstar-check fails, Z3 is absent or the wrong version, a new clone needs verification tooling, or an agent needs to diagnose F* extraction/checking prerequisites.
---

# F* Environment

Use this skill for F* toolchain setup and diagnosis in `wikifn-fstar`.

This is adapted from Dan Brickley's Factoidal `fstar-env` skill:
https://github.com/danbri/factoidal/blob/claude/main/skills/fstar-env/SKILL.md

## Rules

1. Do not use `--lax` for real verification work.
2. Activate the opam switch before invoking F*:

```sh
eval $(opam env --switch=fstar)
```

3. Prefer a pinned, known-good Z3 over an arbitrary system Z3.
4. Report exact tool paths and versions before changing the environment.
5. Keep installation notes repo-local unless the user explicitly wants shell startup files changed.

## Diagnostic

Run:

```sh
opam --version 2>&1 || echo "opam: missing"
opam switch list 2>&1 || true
command -v fstar.exe || command -v fstar || echo "fstar: not on PATH"
z3 --version 2>&1 || echo "z3: missing"
node --version
npm --version
make fstar-check
```

If an opam switch named `fstar` exists but F* is not on `PATH`, try:

```sh
eval $(opam env --switch=fstar)
command -v fstar.exe || command -v fstar
```

## macOS Setup

Install base tools:

```sh
brew install opam gmp pkg-config z3
```

Create the switch if needed:

```sh
opam init -y
opam switch create fstar ocaml-base-compiler.4.14.1
eval $(opam env --switch=fstar)
opam install -y fstar zarith
```

Then verify:

```sh
eval $(opam env --switch=fstar)
fstar.exe --version || fstar --version
z3 --version
make fstar-check
```

## Linux Setup

Install base tools:

```sh
sudo apt-get update
sudo apt-get install -y opam libgmp-dev pkg-config unzip curl
```

Create the switch if needed:

```sh
opam init -y
opam switch create fstar ocaml-base-compiler.4.14.1
eval $(opam env --switch=fstar)
opam install -y fstar zarith
```

Install Z3 from the OS package only if it is new enough for the selected F* version. Otherwise use a pinned release binary or the `z3-solver` Python wheel as a fallback.

## This Repo

F* files live under:

```text
src/fstar/
```

The check hook is:

```sh
make fstar-check
```

It tries, in order:

1. `FSTAR=/absolute/path/to/fstar.exe`
2. `fstar.exe` on `PATH`
3. `fstar` on `PATH`
4. `opam exec --switch=fstar -- fstar.exe`
5. `opam exec --switch=fstar -- fstar`

If it fails, fix the toolchain rather than weakening the F* files.

## Expected Report

When done, report:

- opam version and active switch
- F* path and version
- Z3 path and version
- `make fstar-check` result
- any installation step skipped or requiring user approval

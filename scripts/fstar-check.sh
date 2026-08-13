#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
files=(
  "$root/src/fstar/Wikifn.Primitive.Kernel.fst"
  "$root/src/fstar/Wikifn.Zid.fst"
  "$root/src/fstar/Wikifn.Model.fst"
  "$root/src/fstar/Wikifn.Canonical.fst"
  "$root/src/fstar/Wikifn.Eval.fst"
  "$root/src/fstar/Wikifn.Generated.Eval.fst"
  "$root/src/fstar/Wikifn.Primitive.Frontier.fst"
  "$root/src/fstar/Wikifn.Primitives.fst"
  "$root/src/fstar/Wikifn.Composition.fst"
  "$root/src/fstar/Wikifn.Generated.Compositions.fst"
  "$root/src/fstar/Wikifn.Compiled.Compositions.fst"
  "$root/src/fstar/Wikifn.Specialized.Compositions.fst"
  "$root/src/fstar/Wikifn.Semantics.fst"
)

run_fstar() {
  local cmd="$1"
  shift
  "$cmd" --cache_checked_modules --odir "$root/src/fstar/.cache" "$@" "${files[@]}"
}

mkdir -p "$root/src/fstar/.cache"

if [[ -d "$root/third_party/fstar-z3/bin" ]]; then
  export PATH="$root/third_party/fstar-z3/bin:$PATH"
fi

if [[ -n "${FSTAR:-}" ]] && command -v "$FSTAR" >/dev/null 2>&1; then
  run_fstar "$FSTAR"
  exit 0
fi

if command -v fstar.exe >/dev/null 2>&1; then
  run_fstar fstar.exe
  exit 0
fi

if command -v fstar >/dev/null 2>&1; then
  run_fstar fstar
  exit 0
fi

if command -v opam >/dev/null 2>&1; then
  if opam exec --switch=fstar -- fstar.exe --version >/dev/null 2>&1; then
    opam exec --switch=fstar -- fstar.exe --cache_checked_modules --odir "$root/src/fstar/.cache" "${files[@]}"
    exit 0
  fi
  if opam exec --switch=fstar -- fstar --version >/dev/null 2>&1; then
    opam exec --switch=fstar -- fstar --cache_checked_modules --odir "$root/src/fstar/.cache" "${files[@]}"
    exit 0
  fi
fi

cat >&2 <<'EOF'
F* executable not found.

Set FSTAR=/path/to/fstar.exe, put fstar.exe/fstar on PATH, or install it into
the opam switch named "fstar" so that:

  opam exec --switch=fstar -- fstar.exe --version

works.
EOF
exit 127

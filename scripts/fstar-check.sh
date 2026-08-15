#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The generated bodies are split across part modules. A single module holding
# all of them needs tens of gigabytes and is killed; see the note in
# scripts/generate-fstar-eval.js. Sorted so the listing is stable.
generated_parts=()
while IFS= read -r part; do
  generated_parts+=("$part")
done < <(find "$root/src/fstar" -name 'Wikifn.Generated.Eval.Part*.fst' | sort)

# Literal values too large to sit inside a body, lifted out and shared. The
# parts open these, so they are checked first.
generated_values=()
while IFS= read -r part; do
  generated_values+=("$part")
done < <(find "$root/src/fstar" -name 'Wikifn.Generated.Eval.Values*.fst' | sort)

files=(
  "$root/src/fstar/Wikifn.Primitive.Kernel.fst"
  "$root/src/fstar/Wikifn.Unicode.Case.fst"
  "$root/src/fstar/Wikifn.Zid.fst"
  "$root/src/fstar/Wikifn.Zid.Laws.fst"
  "$root/src/fstar/Wikifn.Model.fst"
  "$root/src/fstar/Wikifn.Canonical.fst"
  "$root/src/fstar/Wikifn.Eval.fst"
  "$root/src/fstar/Wikifn.Print.fst"
  "$root/src/fstar/Wikifn.Roundtrip.fst"
  "${generated_values[@]}"
  "${generated_parts[@]}"
  "$root/src/fstar/Wikifn.Generated.Eval.fst"
  "$root/src/fstar/Wikifn.Fuel.fst"
  "$root/src/fstar/Wikifn.Direct.fst"
  "$root/src/fstar/Wikifn.Compiled.Direct.fst"
  "$root/src/fstar/Wikifn.Primitive.Frontier.fst"
  "$root/src/fstar/Wikifn.Primitives.fst"
  "$root/src/fstar/Wikifn.Composition.fst"
  "$root/src/fstar/Wikifn.Generated.Compositions.fst"
  "$root/src/fstar/Wikifn.Compiled.Compositions.fst"
  "$root/src/fstar/Wikifn.Specialized.Compositions.fst"
  "$root/src/fstar/Wikifn.Semantics.fst"
)

# One module per process, in dependency order.
#
# F* does not release much between modules, so checking the whole list in a
# single invocation accumulates until the machine swaps: measured at a 66 GB
# peak footprint and an OOM kill on a 16 GB machine. Checked one at a time each
# module starts from nothing, and --cache_checked_modules means a module whose
# .checked file is current is skipped rather than re-proved. That is also what
# makes a regeneration cheap: only the parts that changed are re-checked.
#
# WIKIFN_FSTAR_MEMORY_MB caps a single module so a pathological one fails
# loudly instead of taking the machine down with it. This is best effort:
# macOS rejects setrlimit(RLIMIT_AS), so there the cap does nothing and the
# protection is only the one-process-per-module isolation above.
run_fstar() {
  local cmd="$1"
  shift
  local limit_mb="${WIKIFN_FSTAR_MEMORY_MB:-6000}"
  local file
  for file in "${files[@]}"; do
    echo "==> $(basename "$file")"
    ( ulimit -v $(( limit_mb * 1024 )) 2>/dev/null || true
      "$cmd" --cache_checked_modules --include "$root/src/fstar" \
        --odir "$root/src/fstar/.cache" "$@" "$file" )
  done
}

opam_fstar_exe() { opam exec --switch=fstar -- fstar.exe "$@"; }
opam_fstar() { opam exec --switch=fstar -- fstar "$@"; }

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
    run_fstar "opam_fstar_exe"
    exit 0
  fi
  if opam exec --switch=fstar -- fstar --version >/dev/null 2>&1; then
    run_fstar "opam_fstar"
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

#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${FSTAR_OCAML_OUT:-$root/build/fstar/ocaml}"

mkdir -p "$out_dir"

if [[ -d "$root/third_party/fstar-z3/bin" ]]; then
  export PATH="$root/third_party/fstar-z3/bin:$PATH"
fi

run_fstar() {
  local cmd="$1"
  "$cmd" \
    --codegen OCaml \
    --extract 'Wikifn.Primitive.Kernel Wikifn.Primitives Wikifn.Composition Wikifn.Generated.Compositions Wikifn.Specialized.Compositions' \
    --odir "$out_dir" \
    "$root/src/fstar/Wikifn.Primitive.Kernel.fst" \
    "$root/src/fstar/Wikifn.Primitives.fst" \
    "$root/src/fstar/Wikifn.Composition.fst" \
    "$root/src/fstar/Wikifn.Generated.Compositions.fst" \
    "$root/src/fstar/Wikifn.Specialized.Compositions.fst"
}

if [[ -n "${FSTAR:-}" ]] && command -v "$FSTAR" >/dev/null 2>&1; then
  run_fstar "$FSTAR"
elif command -v fstar.exe >/dev/null 2>&1; then
  run_fstar fstar.exe
elif command -v fstar >/dev/null 2>&1; then
  run_fstar fstar
elif command -v opam >/dev/null 2>&1 && opam exec --switch=fstar -- fstar.exe --version >/dev/null 2>&1; then
  opam exec --switch=fstar -- fstar.exe \
    --codegen OCaml \
    --extract 'Wikifn.Primitive.Kernel Wikifn.Primitives Wikifn.Composition Wikifn.Generated.Compositions Wikifn.Specialized.Compositions' \
    --odir "$out_dir" \
    "$root/src/fstar/Wikifn.Primitive.Kernel.fst" \
    "$root/src/fstar/Wikifn.Primitives.fst" \
    "$root/src/fstar/Wikifn.Composition.fst" \
    "$root/src/fstar/Wikifn.Generated.Compositions.fst" \
    "$root/src/fstar/Wikifn.Specialized.Compositions.fst"
else
  echo "F* executable not found" >&2
  exit 127
fi

for generated_ml in "$out_dir"/*.ml; do
  if [[ -f "$generated_ml" ]]; then
    perl -0pi -e 's/[ \t]+\n/\n/g' "$generated_ml"
  fi
done

echo "$out_dir/Wikifn_Primitive_Kernel.ml"
echo "$out_dir/Wikifn_Primitives.ml"
echo "$out_dir/Wikifn_Composition.ml"
echo "$out_dir/Wikifn_Generated_Compositions.ml"
echo "$out_dir/Wikifn_Specialized_Compositions.ml"

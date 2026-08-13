#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ocaml_out="${FSTAR_OCAML_OUT:-$root/build/fstar/ocaml}"
js_out="${FSTAR_JS_OUT:-$root/docs/generated/wikifn_primitives_demo.cjs}"
bytecode="$root/build/fstar/wikifn_primitives_demo.byte"
runner="$root/src/ocaml/wikifn_primitives_demo.ml"

fstar_locate_ocaml() {
  if command -v fstar.exe >/dev/null 2>&1; then
    fstar.exe --locate_ocaml
  elif command -v opam >/dev/null 2>&1 && opam exec --switch=fstar -- fstar.exe --version >/dev/null 2>&1; then
    opam exec --switch=fstar -- fstar.exe --locate_ocaml
  else
    return 1
  fi
}

find_prims_dir() {
  local ocaml_root
  ocaml_root="$(fstar_locate_ocaml)" || return 1
  local candidates=(
    "$ocaml_root/fstar/ulib/ml/app"
    "$ocaml_root/ulib/ml/app"
    "$ocaml_root/fstar/lib/app"
    "$ocaml_root/lib/app"
  )
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate/Prims.cmo" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

prims_dir="$(find_prims_dir || true)"

"$root/scripts/extract-fstar-ocaml.sh" >/dev/null

mkdir -p "$(dirname "$bytecode")" "$(dirname "$js_out")"

if [[ -z "$prims_dir" || ! -f "$prims_dir/Prims.cmo" ]]; then
  echo "Could not locate F* OCaml Prims.cmo" >&2
  exit 127
fi

if command -v ocamlfind >/dev/null 2>&1; then
  ocamlfind ocamlc \
    -package zarith,yojson,ppx_deriving_yojson.runtime,ppx_deriving.runtime \
    -linkpkg \
    -I "$prims_dir" \
    -I "$ocaml_out" \
    "$prims_dir/Prims.cmo" \
    "$ocaml_out/Wikifn_Primitive_Kernel.ml" \
    "$ocaml_out/Wikifn_Primitives.ml" \
    "$ocaml_out/Wikifn_Composition.ml" \
    "$ocaml_out/Wikifn_Generated_Compositions.ml" \
    "$runner" \
    -o "$bytecode"
elif command -v opam >/dev/null 2>&1 && opam exec --switch=fstar -- which ocamlfind >/dev/null 2>&1; then
  opam exec --switch=fstar -- ocamlfind ocamlc \
    -package zarith,yojson,ppx_deriving_yojson.runtime,ppx_deriving.runtime \
    -linkpkg \
    -I "$prims_dir" \
    -I "$ocaml_out" \
    "$prims_dir/Prims.cmo" \
    "$ocaml_out/Wikifn_Primitive_Kernel.ml" \
    "$ocaml_out/Wikifn_Primitives.ml" \
    "$ocaml_out/Wikifn_Composition.ml" \
    "$ocaml_out/Wikifn_Generated_Compositions.ml" \
    "$runner" \
    -o "$bytecode"
else
  echo "ocamlfind not found" >&2
  exit 127
fi

if command -v js_of_ocaml >/dev/null 2>&1; then
  js_of_ocaml --target-env=nodejs +zarith_stubs_js/biginteger.js +zarith_stubs_js/runtime.js "$bytecode" -o "$js_out"
elif command -v opam >/dev/null 2>&1 && opam exec --switch=fstar -- which js_of_ocaml >/dev/null 2>&1; then
  opam exec --switch=fstar -- js_of_ocaml --target-env=nodejs +zarith_stubs_js/biginteger.js +zarith_stubs_js/runtime.js "$bytecode" -o "$js_out"
else
  echo "js_of_ocaml not found" >&2
  exit 127
fi

echo "$js_out"

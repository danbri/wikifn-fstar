#!/usr/bin/env bash
set -euo pipefail

# Extracts Wikifn.Eval and the generated bodies to OCaml, links the engine
# runner, and emits a JavaScript artifact that exposes wikifnEngineCall.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ocaml_out="${FSTAR_ENGINE_OCAML_OUT:-$root/build/fstar/engine}"
js_out="${FSTAR_ENGINE_JS_OUT:-$root/docs/generated/wikifn_engine.js}"
bytecode="$root/build/fstar/wikifn_engine.byte"

if [[ -d "$root/third_party/fstar-z3/bin" ]]; then
  export PATH="$root/third_party/fstar-z3/bin:$PATH"
fi

fstar() {
  if command -v fstar.exe >/dev/null 2>&1; then fstar.exe "$@"
  else opam exec --switch=fstar -- fstar.exe "$@"
  fi
}

ocamlfind_run() {
  if command -v ocamlfind >/dev/null 2>&1; then ocamlfind "$@"
  else opam exec --switch=fstar -- ocamlfind "$@"
  fi
}

js_of_ocaml_run() {
  if command -v js_of_ocaml >/dev/null 2>&1; then js_of_ocaml "$@"
  else opam exec --switch=fstar -- js_of_ocaml "$@"
  fi
}

mkdir -p "$ocaml_out" "$(dirname "$bytecode")" "$(dirname "$js_out")"

# The generated bodies live in part modules; a single module holding all of
# them cannot be checked. Sorted, so the OCaml link order below is the
# dependency order.
generated_parts=()
while IFS= read -r part; do
  generated_parts+=("$part")
done < <(find "$root/src/fstar" -name 'Wikifn.Generated.Eval.Part*.fst' | sort)

if [[ ${#generated_parts[@]} -eq 0 ]]; then
  echo "No Wikifn.Generated.Eval.Part*.fst found; run make fstar-generate-eval first." >&2
  exit 1
fi

fstar \
  --codegen OCaml \
  --extract 'Wikifn.Primitive.Kernel Wikifn.Zid Wikifn.Eval Wikifn.Print Wikifn.Generated.Eval Wikifn.Generated.Eval.*' \
  --include "$root/src/fstar" \
  --odir "$ocaml_out" \
  "$root/src/fstar/Wikifn.Primitive.Kernel.fst" \
  "$root/src/fstar/Wikifn.Zid.fst" \
  "$root/src/fstar/Wikifn.Eval.fst" \
  "$root/src/fstar/Wikifn.Print.fst" \
  "${generated_parts[@]}" \
  "$root/src/fstar/Wikifn.Generated.Eval.fst"

generated_part_ml=()
for part in "${generated_parts[@]}"; do
  name="$(basename "$part" .fst)"
  generated_part_ml+=("$ocaml_out/${name//./_}.ml")
done

ocaml_root="$(fstar --locate_ocaml)"
prims_dir=""
for candidate in \
  "$ocaml_root/fstar/ulib/ml/app" "$ocaml_root/ulib/ml/app" \
  "$ocaml_root/fstar/lib/app" "$ocaml_root/lib/app"; do
  if [[ -f "$candidate/Prims.cmo" ]]; then prims_dir="$candidate"; break; fi
done
if [[ -z "$prims_dir" ]]; then
  echo "Could not locate F* OCaml Prims.cmo" >&2
  exit 127
fi

ocamlfind_run ocamlc \
  -package zarith,js_of_ocaml,yojson,ppx_deriving_yojson.runtime,ppx_deriving.runtime \
  -linkpkg \
  -I "$prims_dir" \
  -I "$ocaml_out" \
  -I "$root/src/ocaml" \
  "$prims_dir/Prims.cmo" \
  "$prims_dir/FStar_Pervasives_Native.ml" \
  "$ocaml_out/Wikifn_Primitive_Kernel.ml" \
  "$ocaml_out/Wikifn_Zid.ml" \
  "$ocaml_out/Wikifn_Eval.ml" \
  "$ocaml_out/Wikifn_Print.ml" \
  "${generated_part_ml[@]}" \
  "$ocaml_out/Wikifn_Generated_Eval.ml" \
  "$root/src/ocaml/wikifn_engine.ml" \
  "$root/src/ocaml/wikifn_engine_browser.ml" \
  -o "$bytecode"

# Two artifacts: a CommonJS build for Node (this package is type=module, so a
# .js file using require would be read as ESM) and a browser build for pages.
js_of_ocaml_run --target-env=nodejs \
  +zarith_stubs_js/biginteger.js +zarith_stubs_js/runtime.js \
  "$bytecode" -o "${js_out%.js}.cjs"

js_of_ocaml_run --target-env=browser \
  +zarith_stubs_js/biginteger.js +zarith_stubs_js/runtime.js \
  "$bytecode" -o "$js_out"

echo "${js_out%.js}.cjs"
echo "$js_out"

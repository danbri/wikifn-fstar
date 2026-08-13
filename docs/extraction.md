# Extraction Strategy

Current status: this repo is not yet in a Low* regime.

The present F* files are high-level specification/model code:

- inductive ZObject terms
- strings and lists
- abstract validity/type predicates
- lemma-oriented primitive specs

That shape is appropriate for the trusted model and proof work. It is not the restricted Low* subset intended for direct C extraction through KaRaMeL.

## Practical Path

1. Use ordinary F* for the object model, typing rules, and proof statements.
2. Extract a pure executable core to OCaml where feasible.
3. Compile OCaml to JavaScript or Wasm using the OCaml ecosystem where that is useful.
4. Separately design a Low* kernel only for small, performance-sensitive pieces that really need C extraction.

Do not promise C/Wasm extraction for the whole Wikifunctions object model until the relevant modules are deliberately written in Low* style.

## Tooling Status

`make fstar-check` works with F* 2025.03.25 and pinned Z3 binaries from F*'s `get_fstar_z3.sh` helper.

KaRaMeL is not installed in the main `fstar` opam switch because the opam `karamel` package currently depends on F* 2022.01.15 and an older OCaml stack. C extraction should use a separate extraction switch or container rather than weakening the verification switch.

## Local Extraction Status

Checked locally on 2026-08-13 in the `fstar` opam switch:

- `fstar.exe` is available: F* 2025.03.25~dev, OCaml 4.14.1.
- `ocamlopt` is available: OCaml 4.14.1.
- `js_of_ocaml` is available: 6.3.2.
- `wasm_of_ocaml` is available: 6.3.2.
- `krml` is not available in this switch.

What works in this repo today:

- The F* model and primitive kernel are checked by `make fstar-check`.
- F* extracts `Wikifn.Primitive.Kernel`, `Wikifn.Primitives`, `Wikifn.Composition`, `Wikifn.Generated.Compositions`, `Wikifn.Compiled.Compositions`, and `Wikifn.Specialized.Compositions` to OCaml with `--codegen OCaml`.
- The extracted JS runner evaluates primitive cases, selected F* IR composition cases, generated direct F* functions, and direct specialized F* functions for selected string/control functions including `Z10052`, `Z10627`, `Z11082`, `Z19612`, `Z21679`, `Z22294`, `Z22649`, `Z27053`, and `Z38114`.

What now works as a repo command:

```sh
make fstar-generate-compositions
make fstar-js-demo
node ./bin/wikifn.js fstar-demo
node docs/generated/wikifn_primitives_demo.cjs
make fstar-browser-demo
```

`make fstar-generate-compositions` regenerates `src/fstar/Wikifn.Generated.Compositions.fst` and `src/fstar/Wikifn.Compiled.Compositions.fst` from selected pinned objects in the local cache. The generated F* modules record the ZID revisions and canonical digests used for the selected paths.

`make fstar-js-demo` verifies/extracts `Wikifn.Primitive.Kernel`, `Wikifn.Primitives`, `Wikifn.Composition`, `Wikifn.Generated.Compositions`, `Wikifn.Compiled.Compositions`, and `Wikifn.Specialized.Compositions`, links the extracted OCaml against F*'s `Prims.cmo`, includes `zarith_stubs_js` when invoking `js_of_ocaml`, and emits `docs/generated/wikifn_primitives_demo.cjs`. `wikifn fstar-demo` only runs that generated artifact; it does not use the junk proof-of-concept evaluator.

`Wikifn.Generated.Compositions` is the selected-pinned-composition interpreter path: local cache objects become generated F* IR, then the extracted F* interpreter evaluates the IR. `Wikifn.Compiled.Compositions` is the generated direct-function path: selected pinned compositions are lowered directly into F* functions over the checked primitive kernel. `Wikifn.Specialized.Compositions` is the hand-maintained direct-function reference path for the same selected examples. The generated direct compiler recognizes the selected private-use marker idiom used by `Z36070`; that is an optimization, not a full equivalence proof for arbitrary compositions.

The interpreter now has a checked `Z14613` fast path in `Wikifn.Composition`, so generated IR for ROT13, superscript, script conversion, and subscript examples can run in the browser demo. The fast path is a direct F* implementation of the selected `Z14613` string-transform semantics; a full equivalence proof against every expansion of recursive `Z36070` is still future work.

`make fstar-browser-demo` uses the same extracted F* primitive module with a different OCaml runner and a tiny JavaScript output stub. The stub only appends JSON lines to the page; the primitive computation is still from extracted F*. The OCaml bytecode link uses `-no-check-prims` because `wikifn_publish` is supplied as a `js_of_ocaml` runtime primitive.

The browser artifact was checked under Node with a minimal DOM shim (`document.getElementById("fstar-extraction-output")`, `TextDecoder`, and `TextEncoder`). It appended the same JSON result lines to the target element.

The generated JavaScript currently prints 31 JSON lines. Representative lines:

```json
{"case":"Z782 is_zero(0)","result":{"ok":true,"value":{"type":"Z40","value":true}}}
{"case":"ROT13 Latin alphabet (Z10627) on \"hello\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[117,114,121,121,98],"text":"uryyb","ascii":"uryyb"}}}
{"case":"Turn to superscript (Z19612) on \"x2+y3\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[739,178,8314,696,179],"text":"ˣ²⁺ʸ³","ascii":""}}}
{"case":"Compiled F* ROT13 Latin alphabet (Z10627) on \"hello\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[117,114,121,121,98],"text":"uryyb","ascii":"uryyb"}}}
{"case":"Compiled F* turn to superscript (Z19612) on \"x2+y3\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[739,178,8314,696,179],"text":"ˣ²⁺ʸ³","ascii":""}}}
{"case":"Arabic numerals to Devanagari numerals (Z22649) on \"123\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[2407,2408,2409],"text":"१२३","ascii":""}}}
{"case":"Specialized F* ROT13 Latin alphabet (Z10627) on \"hello\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[117,114,121,121,98],"text":"uryyb","ascii":"uryyb"}}}
{"case":"Specialized F* turn to superscript (Z19612) on \"x2+y3\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[739,178,8314,696,179],"text":"ˣ²⁺ʸ³","ascii":""}}}
{"case":"Specialized F* digits to subscript (Z27053) on \"H2O\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[72,8322,79],"text":"H₂O","ascii":"HO"}}}
```

Learning from the first failed path: `fstar.exe --ocamlc` made a bytecode executable, but the generated JS failed on `caml_thread_initialize not implemented`. The working path links only the small required F* `Prims.cmo` and passes `+zarith_stubs_js/biginteger.js +zarith_stubs_js/runtime.js` to `js_of_ocaml`.

What is not wired yet:

- Adapters from canonical Wikifunctions ZObjects to the extracted F* IR.
- A general implementation-selection policy over arbitrary pinned worlds.
- Low*/KaRaMeL extraction to C.

Commands used for the local smoke test:

```sh
mkdir -p tmp/fstar-ocaml-extract

PATH=third_party/fstar-z3/bin:$PATH opam exec --switch=fstar -- \
  fstar.exe --codegen OCaml --extract 'Wikifn' \
  --odir tmp/fstar-ocaml-extract \
  src/fstar/Wikifn.Model.fst \
  src/fstar/Wikifn.Primitive.Kernel.fst \
  src/fstar/Wikifn.Primitives.fst \
  src/fstar/Wikifn.Semantics.fst

opam exec --switch=fstar -- fstar.exe --ocamlc \
  -I tmp/fstar-ocaml-extract \
  tmp/fstar-ocaml-extract/Wikifn_Primitives.ml \
  tmp/fstar-ocaml-extract/primitive_runner.ml \
  -o tmp/fstar-ocaml-extract/primitive_runner.byte

opam exec --switch=fstar -- tmp/fstar-ocaml-extract/primitive_runner.byte
```

The final command printed:

```text
3
```

`wasm_of_ocaml` is installed but not wired into a passing repo command yet.

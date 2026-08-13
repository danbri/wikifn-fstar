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
- F* extracts `Wikifn.Primitive.Kernel`, `Wikifn.Primitives`, `Wikifn.Composition`, and `Wikifn.Generated.Compositions` to OCaml with `--codegen OCaml`.
- The extracted JS runner evaluates primitive cases and selected F* IR composition cases for `Z10052`, `Z21679`, `Z38114`, and `Z22294`.

What now works as a repo command:

```sh
make fstar-generate-compositions
make fstar-js-demo
node ./bin/wikifn.js fstar-demo
node docs/generated/wikifn_primitives_demo.cjs
make fstar-browser-demo
```

`make fstar-generate-compositions` regenerates `src/fstar/Wikifn.Generated.Compositions.fst` from selected pinned objects in the local cache. The generated F* module records the ZID revisions and canonical digests used for the selected paths.

`make fstar-js-demo` verifies/extracts `Wikifn.Primitive.Kernel`, `Wikifn.Primitives`, `Wikifn.Composition`, and `Wikifn.Generated.Compositions`, links the extracted OCaml against F*'s `Prims.cmo`, includes `zarith_stubs_js` when invoking `js_of_ocaml`, and emits `docs/generated/wikifn_primitives_demo.cjs`. `wikifn fstar-demo` only runs that generated artifact; it does not use the junk proof-of-concept evaluator.

`make fstar-browser-demo` uses the same extracted F* primitive module with a different OCaml runner and a tiny JavaScript output stub. The stub only appends JSON lines to the page; the primitive computation is still from extracted F*. The OCaml bytecode link uses `-no-check-prims` because `wikifn_publish` is supplied as a `js_of_ocaml` runtime primitive.

The browser artifact was checked under Node with a minimal DOM shim (`document.getElementById("fstar-extraction-output")`, `TextDecoder`, and `TextEncoder`). It appended the same JSON result lines to the target element.

The generated JavaScript prints:

```json
{"case":"Z782 is_zero(0)","result":{"ok":true,"value":{"type":"Z40","value":true}}}
{"case":"Z783 successor(2)","result":{"ok":true,"value":{"type":"Z10","value":"3"}}}
{"case":"Z784 predecessor(2)","result":{"ok":true,"value":{"type":"Z10","value":"1"}}}
{"case":"Z784 predecessor(0)","result":{"ok":false,"error":"underflow"}}
{"case":"Remove regular spaces (Z10052) on \"a b c\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[97,98,99],"ascii":"abc"}}}
{"case":"Decimal comma to point (Z21679) on \"3,14\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[51,46,49,52],"ascii":"3.14"}}}
{"case":"French contractions (Z38114) on \"de les amis et de le chat\"","result":{"ok":true,"value":{"type":"Z6","codepoints":[100,101,115,32,97,109,105,115,32,101,116,32,100,117,32,99,104,97,116],"ascii":"des amis et du chat"}}}
{"case":"Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]","result":{"ok":true,"value":{"type":"Z6","codepoints":[49,50,51],"ascii":"123"}}}
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

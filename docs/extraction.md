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

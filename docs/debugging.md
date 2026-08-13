# Debugging And Observability

The JavaScript evaluator is a prototype interpreter for the Wikifunctions composition subset. It is useful for debugging the intended semantics before those semantics are made authoritative in F*.

The first F*-grounded primitive specs live in `src/fstar/Wikifn.Primitives.fst`. They cover only the toy natural-number operations used by `eval-example`: zero test, successor, and predecessor with underflow.
The broader initial kernel lives in `src/fstar/Wikifn.Primitive.Kernel.fst` and adds natural equality plus a strings-as-codepoint-lists model for empty, length, concat, and starts-with.

## Evaluation Trace

```sh
node ./bin/wikifn.js eval-example --trace
```

The trace records:

- function calls
- selected `Z14K2` composition implementations
- builtin primitive calls
- evaluated arguments
- lazy `Z802` branch choices
- resolved pinned references

## Profile

```sh
node ./bin/wikifn.js eval-example --profile
```

The profile records elapsed wall-clock time, fuel used, maximum call depth, event counts, and memory deltas.

## Analysis Reports

```sh
node ./bin/wikifn.js analyze Z22294
node ./bin/wikifn.js analyze --json Z22294
```

The text report is for humans. The JSON report is for tooling.

Status meanings:

- `compositionally closed`: every reached function is either a selected `Z14K2` composition, recursive back-edge, or explicitly trusted primitive.
- `open frontier`: analysis reached something that is not yet inside that closed set.
- `primitive`: the function is trusted by the selected primitive policy.

Closure is always relative to a fetched corpus and primitive policy.

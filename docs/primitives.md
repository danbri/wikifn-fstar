# Primitive Grounding

Current checked primitive modules:

- `src/fstar/Wikifn.Primitives.fst`: small toy natural-number primitives used by `eval-example`.
- `src/fstar/Wikifn.Primitive.Kernel.fst`: first reusable kernel specs for natural numbers and strings-as-codepoint-lists.

The kernel currently covers:

- natural equality
- zero test
- successor
- predecessor with underflow
- empty text
- text emptiness
- text length
- text concatenation
- text starts-with

These are F*-checked specs, not yet Low* buffer implementations.

The current checked kernel is intentionally small. It gives us a concrete place to attach Wikifunctions primitive IDs, tests, and later Low* refinements.

## Mapping Candidates

Immediate Wikifunctions candidates:

- `Z782`: is zero, natural number
- `Z783`: successor
- `Z784`: predecessor
- `Z13522`: equality of natural numbers
- `Z10008`: is empty string
- `Z11040`: string length
- `Z10000`: join two strings
- `Z10615`: string starts with

These should be registered only after their Wikifunctions argument/result conventions are mapped to the F* kernel values.

## Low* Plan

The high-level specs use lists because they are simple to prove against. A Low* implementation should refine text to explicit buffers:

```text
spec text = list codepoint
Low* text = pointer + length + capacity / slice
```

Then each Low* primitive gets a proof obligation against the list spec. This keeps the executable C path separate from the mathematical meaning.

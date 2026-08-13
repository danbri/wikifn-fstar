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
- first character as a one-codepoint text
- remove first character
- remove all characters from a given character set
- Unicode range to text
- replace all non-empty substrings
- lazy `Z802`-style conditional

These are F*-checked specs, not yet Low* buffer implementations.

The current checked kernel is intentionally small. It gives us a concrete place to attach Wikifunctions primitive IDs, tests, and later Low* refinements.

## Mapping Candidates

Immediate Wikifunctions candidates:

- `Z782`: is zero, natural number
- `Z783`: successor
- `Z784`: predecessor
- `Z13522`: equality of natural numbers
- `Z10008`: is empty string
- `Z10075`: replace all substrings
- `Z10901`: get first character of string
- `Z11040`: string length
- `Z14124`: string of characters from unicode range
- `Z14456`: remove first character
- `Z14520`: remove all characters in second string
- `Z10000`: join two strings
- `Z10615`: string starts with
- `Z802`: If

`Z10008`, `Z10075`, `Z10901`, `Z14124`, `Z14456`, `Z14520`, and `Z802` now have checked F* kernel definitions over codepoint-list text. They still need adapter work before an extracted interpreter can run real canonical ZObjects directly.

`Z10000`, `Z10615`, `Z11040`, and `Z13522` remain lower-priority spec candidates already represented by reusable kernel operations, but not yet registered as ZID adapters.

Other good frontier-expansion candidates from the local dump, ordered by usefulness in composition graphs:

- `Z811`: first element
- `Z812`: list without first element
- `Z813`: is empty list
- `Z873`: map function
- `Z866`: string equality
- `Z12899`: join list of strings with delimiter
- `Z21394`: concatenate many strings
- `Z10174`: and
- `Z10184`: or
- `Z10216`: not

## Z36070 Frontier

`Z36070` is the recursive composition implementation of `Z14613` "replace character set". Its direct calls are:

- `Z10008`: is empty string
- `Z10075`: replace all substrings
- `Z10901`: get first character of string
- `Z14124`: string of characters from unicode range
- `Z14456`: remove first character
- `Z14520`: remove all characters in second string
- `Z14613`: recursive call
- `Z802`: If

That means the `Z36070` blocker is not primarily a Python/JavaScript-only dependency. It is the need to ground the string and codepoint substrate precisely enough that these direct calls can be treated as checked primitives or lowered into checked compositions.

## Low* Plan

The high-level specs use lists because they are simple to prove against. A Low* implementation should refine text to explicit buffers:

```text
spec text = list codepoint
Low* text = pointer + length + capacity / slice
```

Then each Low* primitive gets a proof obligation against the list spec. This keeps the executable C path separate from the mathematical meaning.

# Primitive Grounding

> **The ranked frontier below counts wrong.** It reports how many functions each
> missing primitive "blocks", which counts a function once per blocking leaf.
> Those leaf sets overlap almost completely, so several entries each appear to
> block about 1,400 of the same functions. What matters is the *marginal*
> unlock: add the primitive, re-run the fixpoint, take the difference. That is
> now a mode of the tool rather than something done by hand:
>
> ```
> node scripts/analyze-closure.js --set engine --marginal 20
> ```
>
> Read every "blocks N" figure below this line as an upper bound on a shared
> total, not as a count of what grounding that one thing would buy.
>
> **Status, re-measured (68 primitives).** Errors as values and quoting are
> done: `Z5`, `Z851` throw, `Z850` try-catch, `Z853` get-error; `Z99` quote,
> `Z805` reify, `Z808` abstract, `Z899` unquote, `Z29267` quoted reference.
> Reify and abstract are proved inverses in `Wikifn.Roundtrip`. Also done and
> once on this list: records, `Z803` value by key, `Z16829` type of object,
> `Z13052`/`Z29294` equality, `Z22693`/`Z22717` codepoint conversions,
> `Z12668`/`Z12961` reverse and append, `Z13546` natural division, `Z22764`
> String from Type, `Z10047`/`Z10018` Unicode case mapping, and the generic
> type constructors `Z881`/`Z882`/`Z883`.
>
> Closure over the current primitives, counting the compositions written in
> `compositions/`: **1,074** functions without recursion, **1,365** more with.
>
> The largest marginal unlock left is `Z6820` Fetch Wikidata entities at
> **+316**, which is a data fetch rather than a function and would mean pinning
> a second dump. After that the numbers fall off sharply: `Z828` fetch
> persistent object +20, `Z20854` Rational number as float +15, `Z21028`
> exponentiation (float64) +9, `Z150` Validate error type +8. `Z12316` regular
> expression substitute was +45 before quoting landed and is **0** now.
>
> Sections below this line predate all of that and are kept for the reasoning,
> not for the counts.

Current checked primitive modules:

- `src/fstar/Wikifn.Primitives.fst`: small toy natural-number primitives used by `eval-example`.
- `src/fstar/Wikifn.Primitive.Kernel.fst`: first reusable kernel specs for natural numbers and strings-as-codepoint-lists.
- `src/fstar/Wikifn.Primitive.Frontier.fst`: ZID-named wrappers that ground selected high-reuse string primitives against the kernel.

The kernel currently covers:

- natural equality
- zero test
- successor
- predecessor with underflow
- natural decrement with floor at 0
- natural subtraction with floor at 0
- natural greater-than / greater-or-equal / less-than / less-or-equal
- boolean and / or / not
- empty text
- text emptiness
- text length
- text equality
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

`Z10008`, `Z10075`, `Z10901`, `Z14124`, `Z14456`, `Z14520`, and `Z802` have checked F* kernel definitions over codepoint-list text. `Z10000`, `Z10615`, `Z11040`, `Z866`, `Z10174`, `Z10184`, `Z10216`, `Z13522`, `Z13569`, `Z13582`, `Z13676`, `Z13682`, `Z13689`, and `Z13695` are now grounded for the extracted expression interpreter as scalar primitive calls. They still need canonical ZObject adapter work before arbitrary function calls can be loaded directly from wiki JSON at runtime.

## Direct Specialization Targets

These are good follow-ons for the C-priority path: generate selected closed composition paths into direct F* functions, then extract them through OCaml/JavaScript before attempting a general compiler. The current generated direct module is `src/fstar/Wikifn.Compiled.Compositions.fst`; `src/fstar/Wikifn.Specialized.Compositions.fst` remains a hand-maintained reference path.

Implemented direct specializations:

| ZID | English label | Kernel coverage | Demo value |
| --- | --- | --- | --- |
| `Z10627` | ROT13, Latin alphabet | Covered through `Z14613` character-set replacement | Recognizable example: `hello -> uryyb`. |
| `Z11082` | fallback if string is empty | Covered by `Z802` and `Z10008` | Demonstrates control flow, not just replacement. |
| `Z19612` | turn to superscript | Covered through `Z14613` character-set replacement | Readable formatting example: `x2+y3 -> ˣ²⁺ʸ³`. |
| `Z22649` | Arabic numerals to Devanagari numerals | Covered through `Z14613` character-set replacement | Shows round-trip script conversion with existing `Z22294`. |
| `Z27053` | convert digits to lower indices | Covered through `Z14613` character-set replacement | Useful chemistry-style example: `H2O -> H₂O`. |

Good remaining candidates:

| Priority | ZID | English label | Kernel coverage | Blocker | Demo value |
| ---: | --- | --- | --- | --- | --- |
| 1 | `Z15838` | ASCII Braille encode | Covered through `Z14613` | Confirm direction from cached tests and browser display | Strong visual Unicode demo. |
| 2 | `Z10888` / `Z10891` | Hebrew normal/final form conversion | Covered through `Z14613` character-set replacement | Handle right-to-left rendering carefully on the site | Good internationalization example beyond digit scripts. |
| 3 | `Z15175` | join two strings with separator | Partial: kernel has concat and starts-with | Register `Z10000` and `Z10615`; confirm separator semantics | Good readable text-composition demo after string adapters land. |
| 4 | `Z28209` | expand condensed electron configuration | Mostly covered by repeated `Z10075` replacements | Inspect exact scientific strings and constants | Shows domain text transformation rather than toy strings. |

Other good frontier-expansion candidates from the local dump, ordered by usefulness in composition graphs:

- `Z811`: first element
- `Z812`: list without first element
- `Z813`: is empty list
- `Z873`: map function
- `Z12899`: join list of strings with delimiter
- `Z21394`: concatenate many strings

## Current Priority Split

The local SQLite pass shows two different notions of "important".

Low-risk scalar primitives are now the immediate extracted-interpreter substrate: `Z866`, `Z10000`, `Z10174`, `Z10184`, `Z10216`, `Z10615`, `Z11040`, `Z13522`, `Z13569`, `Z13582`, `Z13676`, `Z13682`, `Z13689`, and `Z13695`. These are good eventual Low* candidates because their specs are small and deterministic.

The largest graph unlocks are not all low-risk primitives. `Z803` value by key, `Z805` reify, `Z808` abstract, and `Z22475` value by key safer need an honest object/key semantics. `Z873` map function and `Z876` reduce function need first-class function values, typed-list adapters, explicit fuel, and useful trace semantics. They should be treated as evaluator work, not just more scalar builtins.

## Ranked Frontier From Local SQLite

Source: `cache/wikifunctions.sqlite`, built from the vendored 20260801 dump. These counts are local composition-call edges only; no live Wikifunctions crawling was used.

| Rank | ZID | English label | Composition-call frequency | Cached Z8 shape | Why ground it next | Representative functions moved closer to closed |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1 | `Z811` | first element | 571 | one typed-list argument, returns `Z1` | Core recursive-list primitive; highest ungrounded call count. | `Z37209` German noun phrase from determiner and noun; `Z35874` preferred implementation of function as ZID; `Z19601` N-ifs |
| 2 | `Z10000` | join two strings | 419 | `Z6, Z6 -> Z6` | Grounded in the extracted expression interpreter; next work is canonical call adaptation. | `Z26333` Latin first declension table; `Z35334` print Gregorian year limited by precision, English; `Z12203` English regular superlative form |
| 3 | `Z813` | is empty list | 229 | one typed-list argument, returns `Z40` | Pairs with `Z811`/`Z812` for structural recursion over lists. | `Z19601` N-ifs; `Z12864` lists have equal length; `Z13558` product of list natural numbers |
| 4 | `Z812` | list without first element | 246 | one typed-list argument, returns typed list | Completes the basic list-recursion trio with head and empty. | `Z35874` preferred implementation of function as ZID; `Z13397` get nth element of a list; `Z31019` Levenshtein distance between lists is at most n? |
| 5 | `Z873` | map function | 428 | `Z8, list Z1 -> list Z1` | Very high reuse, but it requires first-class function values and typed-list adapters, so it should follow the basic list kernel. | `Z30157` group by selector; `Z32585` group typed pairs by first element; `Z21347` sort integer-keyed list ascending |
| 6 | `Z21394` | concatenate many strings | 283 | `list Z6 -> Z6` | A good text-generation demo primitive once list traversal and string concat are grounded. | `Z28748` name and lifespan from Wikidata item; `Z26712` subject is an instance of, German; `Z37677` inject Wikidata link if missing label |
| 7 | `Z12899` | join list of strings with delimiter | 149 | `list Z6, Z6 -> Z6` | Common readable text output operation; gives useful end-user demos. | `Z28885` Luxembourgish short description for album; `Z17687` convert RGB to hex colour; `Z17954` substitute MediaWiki edit-change-tags query |
| 8 | `Z13522` | equality of natural numbers | 182 | `Z13518, Z13518 -> Z40` | Grounded in the extracted expression interpreter; next work is canonical call adaptation. | `Z19343` Hindi ordinal; `Z19892` same Rational number object; `Z13397` get nth element of a list |
| 9 | `Z10216` | not | 151 | `Z40 -> Z40` | Grounded in the extracted expression interpreter. | `Z24307` fallback language codes; `Z10215` Boolean identity; `Z31019` Levenshtein distance between lists is at most n? |
| 10 | `Z10174` | and | 160 | `Z40, Z40 -> Z40` | Grounded in the extracted expression interpreter. | `Z24307` fallback language codes; `Z11828` and quaternary; `Z12203` English regular superlative form |
| 11 | `Z10184` | or | 109 | `Z40, Z40 -> Z40` | Grounded in the extracted expression interpreter. | `Z11595` Breton mutation check; `Z11863` vowel membership; `Z11991` German noun declension helper |
| 12 | `Z13582` | decrement natural number by one | 157 | `Z13518 -> Z13518` | Grounded with floor-at-zero semantics matching local tester labels. | `Z14859` Delannoy number; `Z15334` unsigned Stirling number; `Z15386` Wedderburn-Etherington number |
| 13 | `Z12681` | length of a list | 167 | `list Z1 -> Z13518` | Useful after list representation is in place; supports algorithms and validation. | `Z31019` Levenshtein distance bound; `Z29791` zip multiple lists; `Z30977` length of common prefix of many lists |
| 14 | `Z810` | prepend element to list | 110 | `Z1, list Z1 -> list Z1` | Needed for constructive list recursion and map-like functions. | `Z33762` Japanese verb conjugation table; `Z13155` interleave lists; `Z27878` create wikitable with headers |
| 15 | `Z866` | string equality | 130 | `Z6, Z6 -> Z40` | Grounded as codepoint-list equality in the extracted expression interpreter. | `Z21438` 64-bit binary string to float64 special value; `Z21750` read special float value; `Z14392` monolingual text equality |

High-frequency functions deliberately not first in this list:

- `Z803` Value by key is important, but it needs a proper object/record semantics rather than just a primitive string or list operation.
- `Z30120` fetch Wikidata item or parts crosses the external-data boundary. It should be represented as a pinned-world lookup or oracle, not a pure built-in.
- `Z26107` monolingual text from language and string is probably easy as a constructor, but it is less central than the list/string/boolean substrate.

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

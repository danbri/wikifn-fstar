# Compositions written here

Every body under `src/fstar/Wikifn.Generated.Eval.Part*.fst` is a mechanical
translation of a composition pinned in the Wikifunctions dump. This directory is
the exception, and it is kept separate for exactly that reason: these are
compositions **written here**, to fill gaps where Wikifunctions has a function
that only has a code implementation, or none that this engine can follow.

That makes them a different kind of claim, and the repo treats them differently:

- A pinned composition carries the revision and digest it came from. One of these
  carries neither, because there is nothing upstream to point at. The catalogue
  marks it `authored: true` and the demo says so.
- A pinned composition is trusted to say what the corpus says. One of these is
  trusted only as far as it is tested, so `test/authored.test.js` requires every
  file here to pass the Wikifunctions testers for the function it implements.
  A file whose function has no testers is refused rather than accepted on trust.
- Nothing here is used when a usable pinned composition exists. These fill gaps;
  they do not override the corpus.

## The format

Canonical `Z14K2`, the same JSON Wikifunctions itself stores, in one file per
function named for its ZID.

That is deliberate over a friendlier syntax. The translator already reads this
shape, so there is no second parser to keep in step, and a definition here is
directly contributable upstream: it is not a description of a Wikifunctions
composition, it *is* one. For reading, `docs/generated/wikifn.scm` renders it as
an s-expression through the same checked printer as everything else.

```json
{
  "zid": "Z13806",
  "label": "base n to natural number",
  "why": "Wikifunctions has only a Python implementation, so there is nothing to follow.",
  "arguments": ["Z13806K1", "Z13806K2"],
  "Z14K2": { "...": "a canonical composition tree" }
}
```

`zid`, `arguments` and `Z14K2` are required. `arguments` must match the function's
declared keys in the pinned `Z8`, in order, so a call binds the right values;
`why` is required because a gap nobody can explain is a gap nobody should fill.

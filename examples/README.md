# Examples

These files are local fixtures, not live Wikifunctions pages.

`add-snapshot.json` defines one pinned object:

- `Z722`: a `Z14` implementation for the function `Z781`.
- Its `Z14K2` field is a composition.
- The composition uses `Z802`/if plus three selected primitive functions:
  - `Z782`: is zero
  - `Z783`: successor
  - `Z784`: predecessor

The composition is:

```text
add(x, y) =
  if is_zero(y)
  then x
  else add(successor(x), predecessor(y))
```

`add-call.json` calls that function as `add(2, 2)`.

Run:

```sh
node ./bin/wikifn.js eval-example
```

The result is:

```json
{
  "value": {
    "Z1K1": "Z10",
    "Z10K1": "4"
  },
  "fuelRemaining": 87,
  "calls": 13,
  "implementations": [
    "Z781@Z722:1",
    "Z781@Z722:1",
    "Z781@Z722:1"
  ]
}
```

The exact fuel and call counts may change if the evaluator changes. The important value is `{ "Z1K1": "Z10", "Z10K1": "4" }`, meaning a `Z10` natural number with value `4`.

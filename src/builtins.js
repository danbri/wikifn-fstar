import { err, ok } from "./result.js";
import { getField, refZid, stringValue, typeZid, zRecord, zRef, zString } from "./zterm.js";

export const builtinFunctions = new Map([
  ["Z782", isZero],
  ["Z783", successor],
  ["Z784", predecessor]
]);

export function naturalNumber(value) {
  return zRecord([
    ["Z1K1", zRef("Z10")],
    ["Z10K1", zString(String(value))]
  ]);
}

export function booleanValue(value) {
  return zRecord([
    ["Z1K1", zRef("Z40")],
    ["Z40K1", zRef(value ? "Z41" : "Z42")]
  ]);
}

export function readNaturalNumber(term, path = ["$"]) {
  if (typeZid(term) !== "Z10") {
    return err("type_error", `expected Z10/Natural number, got ${typeZid(term) ?? term.kind}`, path);
  }
  const raw = stringValue(getField(term, "Z10K1"));
  if (!raw || !/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    return err("invalid_natural", "Z10K1 must be a base-10 natural number string", path.concat("Z10K1"));
  }
  return ok(BigInt(raw));
}

export function readBoolean(term, path = ["$"]) {
  if (typeZid(term) !== "Z40") {
    return err("type_error", `expected Z40/Boolean, got ${typeZid(term) ?? term.kind}`, path);
  }
  const identity = refZid(getField(term, "Z40K1"));
  if (identity === "Z41") {
    return ok(true);
  }
  if (identity === "Z42") {
    return ok(false);
  }
  return err("invalid_boolean", "Z40K1 must be Z41/true or Z42/false", path.concat("Z40K1"));
}

function isZero(args, path) {
  const input = args.get("Z782K1");
  if (!input) {
    return err("missing_argument", "Z782/is zero requires Z782K1", path.concat("Z782K1"));
  }
  const value = readNaturalNumber(input, path.concat("Z782K1"));
  return value.ok ? ok(booleanValue(value.value === 0n)) : value;
}

function successor(args, path) {
  const input = args.get("Z783K1");
  if (!input) {
    return err("missing_argument", "Z783/successor requires Z783K1", path.concat("Z783K1"));
  }
  const value = readNaturalNumber(input, path.concat("Z783K1"));
  return value.ok ? ok(naturalNumber(value.value + 1n)) : value;
}

function predecessor(args, path) {
  const input = args.get("Z784K1");
  if (!input) {
    return err("missing_argument", "Z784/predecessor requires Z784K1", path.concat("Z784K1"));
  }
  const value = readNaturalNumber(input, path.concat("Z784K1"));
  if (!value.ok) {
    return value;
  }
  if (value.value === 0n) {
    return err("underflow", "Z784/predecessor is undefined for zero", path.concat("Z784K1"));
  }
  return ok(naturalNumber(value.value - 1n));
}

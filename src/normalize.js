import { isControlFreeString, isPlainObject, isZid, isZKey } from "./ids.js";
import { err, ok } from "./result.js";
import { zList, zRecord, zRef, zString } from "./zterm.js";

export function normalizeCanonical(value, path = ["$"]) {
  if (typeof value === "string") {
    if (!isControlFreeString(value)) {
      return err("invalid_string", "Z6 strings must not contain control characters", path);
    }
    return ok(isZid(value) ? zRef(value) : zString(value));
  }

  if (Array.isArray(value)) {
    return normalizeBenjaminArray(value, path);
  }

  if (isPlainObject(value)) {
    const terminal = normalizeExplicitTerminal(value, path);
    if (terminal) {
      return terminal;
    }
    return normalizeRecord(value, path);
  }

  return err(
    "invalid_json_value",
    "canonical ZObjects may contain strings, arrays, or objects only",
    path,
    { valueType: value === null ? "null" : typeof value }
  );
}

function normalizeBenjaminArray(value, path) {
  if (value.length === 0) {
    return err("empty_benjamin_array", "typed list arrays must start with an element type", path);
  }

  const typeResult = normalizeCanonical(value[0], path.concat("0"));
  if (!typeResult.ok) {
    return typeResult;
  }

  const items = [];
  for (let index = 1; index < value.length; index += 1) {
    const itemResult = normalizeCanonical(value[index], path.concat(String(index)));
    if (!itemResult.ok) {
      return itemResult;
    }
    items.push(itemResult.value);
  }
  return ok(zList(typeResult.value, items));
}

function normalizeRecord(value, path) {
  const fields = [];
  for (const key of Object.keys(value)) {
    if (!isZKey(key)) {
      return err("invalid_zkey", `object key ${JSON.stringify(key)} is not a ZObject key`, path.concat(key));
    }
    const childResult = normalizeCanonical(value[key], path.concat(key));
    if (!childResult.ok) {
      return childResult;
    }
    fields.push([key, childResult.value]);
  }
  return ok(zRecord(fields));
}

function normalizeExplicitTerminal(value, path) {
  const type = explicitTypeZid(value.Z1K1);
  if (type === "Z6") {
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== "Z1K1" || keys[1] !== "Z6K1") {
      return err("invalid_z6", "explicit Z6/string objects must contain exactly Z1K1 and Z6K1", path);
    }
    if (typeof value.Z6K1 !== "string" || !isControlFreeString(value.Z6K1)) {
      return err("invalid_z6_value", "Z6K1 must be a control-free JSON string", path.concat("Z6K1"));
    }
    return ok(zString(value.Z6K1));
  }

  if (type === "Z9") {
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== "Z1K1" || keys[1] !== "Z9K1") {
      return err("invalid_z9", "explicit Z9/reference objects must contain exactly Z1K1 and Z9K1", path);
    }
    if (typeof value.Z9K1 !== "string" || !isZid(value.Z9K1)) {
      return err("invalid_z9_value", "Z9K1 must be a ZID string", path.concat("Z9K1"));
    }
    return ok(zRef(value.Z9K1));
  }

  return undefined;
}

function explicitTypeZid(value) {
  if (typeof value === "string" && isZid(value)) {
    return value;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (typeof value.Z1K1 === "string" && value.Z1K1 === "Z9" && typeof value.Z9K1 === "string") {
    return value.Z9K1;
  }
  return undefined;
}

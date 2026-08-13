import { isBuiltinZid, isControlFreeString, isZid, isZKey } from "./ids.js";
import { err, ok } from "./result.js";
import { collectReferences, getField, isCallTo, refZid, stringValue, typeZid, zListItems } from "./zterm.js";

export function checkStructural(term, path = ["$"]) {
  switch (term.kind) {
    case "string":
      return isControlFreeString(term.value)
        ? ok(term)
        : err("invalid_string", "Z6 strings must not contain control characters", path);

    case "ref":
      return isZid(term.zid)
        ? ok(term)
        : err("invalid_zid", `${JSON.stringify(term.zid)} is not a valid ZID`, path);

    case "record":
      return checkRecord(term, path);

    default:
      return err("invalid_term", `unknown term kind ${JSON.stringify(term.kind)}`, path);
  }
}

export function shallowTypeOf(term) {
  switch (term.kind) {
    case "string":
      return { kind: "named", zid: "Z6" };
    case "ref":
      return { kind: "named", zid: "Z9" };
    case "record": {
      const ty = getField(term, "Z1K1");
      if (!ty) {
        return undefined;
      }
      if (ty.kind === "ref") {
        return { kind: "named", zid: ty.zid };
      }
      if (isCallTo(ty, "Z881")) {
        return { kind: "generic", function: "Z881", args: [getField(ty, "Z881K1")] };
      }
      if (ty.kind === "record" && typeZid(ty) === "Z7") {
        return { kind: "computed", call: ty };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

export function collectMissingReferences(term, world, { allowBuiltins = true } = {}) {
  const missing = [];
  for (const zid of collectReferences(term)) {
    if (world.has(zid)) {
      continue;
    }
    if (allowBuiltins && isBuiltinZid(zid)) {
      continue;
    }
    missing.push(zid);
  }
  return missing.sort();
}

function checkRecord(term, path) {
  const seen = new Set();
  for (const [key, value] of term.fields) {
    if (!isZKey(key)) {
      return err("invalid_zkey", `record key ${JSON.stringify(key)} is not a ZObject key`, path.concat(key));
    }
    if (seen.has(key)) {
      return err("duplicate_key", `duplicate record key ${JSON.stringify(key)}`, path.concat(key));
    }
    seen.add(key);
    const child = checkStructural(value, path.concat(key));
    if (!child.ok) {
      return child;
    }
  }

  if (!seen.has("Z1K1")) {
    return err("missing_type", "non-terminal ZObjects must have a Z1K1/type field", path);
  }

  const type = getField(term, "Z1K1");
  if (!isTypeExpression(type)) {
    return err("invalid_type_field", "Z1K1 must be a reference or function-call type expression", path.concat("Z1K1"));
  }

  const typeId = typeZid(term);
  if (typeId === "Z2") {
    return checkPersistentObject(term, path);
  }
  if (typeId === "Z7") {
    return requireFields(term, ["Z7K1"], path);
  }
  if (typeId === "Z8") {
    return requireFields(term, ["Z8K1", "Z8K2"], path);
  }
  if (typeId === "Z14") {
    return checkImplementation(term, path);
  }
  if (typeId === "Z16") {
    return requireFields(term, ["Z16K1", "Z16K2"], path);
  }
  if (typeId === "Z17") {
    return checkArgumentDeclaration(term, path);
  }
  if (typeId === "Z18") {
    return checkArgumentReference(term, path);
  }
  return ok(term);
}

function isTypeExpression(term) {
  if (!term) {
    return false;
  }
  if (term.kind === "ref") {
    return true;
  }
  return term.kind === "record" && typeZid(term) === "Z7";
}

function requireFields(term, fields, path) {
  for (const field of fields) {
    if (!getField(term, field)) {
      return err("missing_field", `missing required field ${field}`, path.concat(field));
    }
  }
  return ok(term);
}

function checkPersistentObject(term, path) {
  const required = requireFields(term, ["Z2K1", "Z2K2"], path);
  if (!required.ok) {
    return required;
  }
  const id = stringValue(getField(term, "Z2K1"));
  if (!id || !isZid(id)) {
    return err("invalid_persistent_id", "Z2K1 must be a Z6 string containing a ZID", path.concat("Z2K1"));
  }
  return ok(term);
}

function checkImplementation(term, path) {
  const required = requireFields(term, ["Z14K1"], path);
  if (!required.ok) {
    return required;
  }
  if (!refZid(getField(term, "Z14K1"))) {
    return err("invalid_implementation_target", "Z14K1 must reference the implemented Z8 function", path.concat("Z14K1"));
  }

  const bodyKeys = ["Z14K2", "Z14K3", "Z14K4"].filter((key) => getField(term, key));
  if (bodyKeys.length !== 1) {
    return err(
      "invalid_implementation_body",
      "Z14 implementations must have exactly one of Z14K2/composition, Z14K3/code, or Z14K4/builtin",
      path
    );
  }
  return ok(term);
}

function checkArgumentDeclaration(term, path) {
  const required = requireFields(term, ["Z17K1", "Z17K2"], path);
  if (!required.ok) {
    return required;
  }
  const key = stringValue(getField(term, "Z17K2"));
  if (!key || !isZKey(key)) {
    return err("invalid_argument_key", "Z17K2 must be a Z6 string containing a key ID", path.concat("Z17K2"));
  }
  return ok(term);
}

function checkArgumentReference(term, path) {
  const required = requireFields(term, ["Z18K1"], path);
  if (!required.ok) {
    return required;
  }
  const key = stringValue(getField(term, "Z18K1"));
  if (!key || !isZKey(key)) {
    return err("invalid_argument_reference", "Z18K1 must be a Z6 string containing a bound key ID", path.concat("Z18K1"));
  }
  return ok(term);
}

export function functionArguments(functionTerm) {
  if (typeZid(functionTerm) !== "Z8") {
    return undefined;
  }
  const declarations = zListItems(getField(functionTerm, "Z8K1"));
  if (!declarations) {
    return undefined;
  }
  const args = [];
  for (const declaration of declarations) {
    if (typeZid(declaration) !== "Z17") {
      return undefined;
    }
    const key = stringValue(getField(declaration, "Z17K2"));
    if (!key) {
      return undefined;
    }
    args.push({
      key,
      type: getField(declaration, "Z17K1"),
      label: getField(declaration, "Z17K3")
    });
  }
  return args;
}

import { isZid } from "./ids.js";

export function zString(value) {
  return { kind: "string", value };
}

export function zRef(zid) {
  return { kind: "ref", zid };
}

export function zRecord(fields) {
  return { kind: "record", fields };
}

export function getField(term, key) {
  if (term.kind !== "record") {
    return undefined;
  }
  const field = term.fields.find(([candidate]) => candidate === key);
  return field ? field[1] : undefined;
}

export function hasField(term, key) {
  return getField(term, key) !== undefined;
}

export function typeTerm(term) {
  return getField(term, "Z1K1");
}

export function typeZid(term) {
  const ty = typeTerm(term);
  return ty && ty.kind === "ref" ? ty.zid : undefined;
}

export function stringValue(term) {
  return term && term.kind === "string" ? term.value : undefined;
}

export function refZid(term) {
  return term && term.kind === "ref" ? term.zid : undefined;
}

export function isType(term, zid) {
  return typeZid(term) === zid;
}

export function isCallTo(term, zid) {
  if (!isType(term, "Z7")) {
    return false;
  }
  return refZid(getField(term, "Z7K1")) === zid;
}

export function zList(elementType, items) {
  const listType = zRecord([
    ["Z1K1", zRef("Z7")],
    ["Z7K1", zRef("Z881")],
    ["Z881K1", elementType]
  ]);

  let tail = zRecord([["Z1K1", listType]]);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    tail = zRecord([
      ["Z1K1", listType],
      ["K1", items[index]],
      ["K2", tail]
    ]);
  }
  return tail;
}

export function zListItems(term) {
  if (term.kind !== "record") {
    return undefined;
  }
  const listType = getField(term, "Z1K1");
  if (!isCallTo(listType, "Z881")) {
    return undefined;
  }

  const items = [];
  let cursor = term;
  while (cursor && cursor.kind === "record") {
    const head = getField(cursor, "K1");
    if (!head) {
      return items;
    }
    items.push(head);
    cursor = getField(cursor, "K2");
    if (!cursor) {
      return items;
    }
  }
  return undefined;
}

export function collectReferences(term, into = new Set()) {
  switch (term.kind) {
    case "string":
      return into;
    case "ref":
      into.add(term.zid);
      return into;
    case "record":
      for (const [, value] of term.fields) {
        collectReferences(value, into);
      }
      return into;
    default:
      throw new Error(`unknown term kind ${term.kind}`);
  }
}

export function termEquals(left, right) {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "string":
      return left.value === right.value;
    case "ref":
      return left.zid === right.zid;
    case "record":
      if (left.fields.length !== right.fields.length) {
        return false;
      }
      for (let i = 0; i < left.fields.length; i += 1) {
        const [leftKey, leftValue] = left.fields[i];
        const [rightKey, rightValue] = right.fields[i];
        if (leftKey !== rightKey || !termEquals(leftValue, rightValue)) {
          return false;
        }
      }
      return true;
    default:
      return false;
  }
}

export function toNormalJson(term) {
  switch (term.kind) {
    case "string":
      return { Z1K1: "Z6", Z6K1: term.value };
    case "ref":
      return { Z1K1: "Z9", Z9K1: term.zid };
    case "record": {
      const object = {};
      for (const [key, value] of term.fields) {
        object[key] = toNormalJson(value);
      }
      return object;
    }
    default:
      throw new Error(`unknown term kind ${term.kind}`);
  }
}

export function toCanonicalJson(term) {
  switch (term.kind) {
    case "string":
      return isZid(term.value) ? { Z1K1: "Z6", Z6K1: term.value } : term.value;
    case "ref":
      return term.zid;
    case "record": {
      const object = {};
      for (const [key, value] of term.fields) {
        object[key] = toCanonicalJson(value);
      }
      return object;
    }
    default:
      throw new Error(`unknown term kind ${term.kind}`);
  }
}

export function describeTerm(term) {
  switch (term.kind) {
    case "string":
      return JSON.stringify(term.value);
    case "ref":
      return term.zid;
    case "record": {
      const type = typeZid(term);
      return type ? `${type}{...}` : "record{...}";
    }
    default:
      return String(term);
  }
}

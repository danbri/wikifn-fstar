const ZID_RE = /^Z[1-9][0-9]*$/;
const ZKEY_RE = /^(?:Z[1-9][0-9]*)?K[1-9][0-9]*$/;

export function isZid(value) {
  return typeof value === "string" && ZID_RE.test(value);
}

export function isZKey(value) {
  return typeof value === "string" && ZKEY_RE.test(value);
}

export function isBuiltinZid(value) {
  if (!isZid(value)) {
    return false;
  }
  const numeric = Number(value.slice(1));
  return Number.isInteger(numeric) && numeric > 0 && numeric < 1000;
}

export function isControlFreeString(value) {
  return typeof value === "string";
}

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

// Thin boundary wrapper around the extracted engine.
//
// Two jobs, both of which belong outside F*: loading the artifact once, and
// keeping a deep evaluation from taking the host process down with it. Fuel
// bounds the evaluator logically, but each nested call also costs JavaScript
// stack, and a stack overflow is thrown by the host rather than returned by the
// engine. A library must not crash its caller, so it is caught here and
// reported in the same envelope shape as every other failure.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let catalog;

function load() {
  if (!catalog) {
    require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));
    const raw = require(path.join(root, "docs", "generated", "functions.json"));
    catalog = {
      functions: raw.functions,
      byZid: new Map(raw.functions.map((entry) => [entry.zid, entry])),
      byName: new Map(raw.functions.map((entry) => [entry.name, entry]))
    };
  }
  return catalog;
}

export function functions() {
  return load().functions;
}

export function lookup(id) {
  const loaded = load();
  return loaded.byZid.get(id) ?? loaded.byName.get(id);
}

/**
 * Call a Wikifunctions function by ZID or by its generated name.
 * Always returns an envelope; never throws for evaluation reasons.
 */
export function call(id, args = [], { fuel = 5000 } = {}) {
  const entry = lookup(id);
  if (!entry) {
    return { ok: false, error: "unknown_function", message: `${id} is not in the engine catalogue` };
  }
  try {
    return JSON.parse(globalThis.wikifnEngineCall(entry.zid, String(fuel), JSON.stringify(args)));
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false,
        error: "depth",
        zid: entry.zid,
        message: "evaluation nested deeper than the host stack allows; lower the fuel or simplify the input"
      };
    }
    return { ok: false, error: "host", zid: entry.zid, message: String(error.message ?? error) };
  }
}

#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.join(root, "cache", "wikifunctions");
const outPath = process.env.WIKIFN_GENERATED_FSTAR ?? path.join(root, "src", "fstar", "Wikifn.Generated.Compositions.fst");

const selected = [
  { functionZid: "Z10052", implementationZid: "Z10077", stem: "z10052" },
  { functionZid: "Z14613", implementationZid: "Z36070", stem: "z14613" },
  { functionZid: "Z21679", implementationZid: "Z21681", stem: "z21679" },
  { functionZid: "Z22294", implementationZid: "Z22295", stem: "z22294" },
  { functionZid: "Z38114", implementationZid: "Z38115", stem: "z38114" }
];

const selectedByFunction = new Map(selected.map((entry) => [entry.functionZid, entry]));
const functionCache = new Map();
const objectCache = new Map();

async function main() {
  const generated = [];
  const provenance = [];

  for (const entry of selected) {
    const implementation = await loadObject(entry.implementationZid);
    const functionZid = refZid(implementation.canonical.Z2K2.Z14K1);
    if (functionZid !== entry.functionZid) {
      throw new Error(`${entry.implementationZid} implements ${functionZid}, expected ${entry.functionZid}`);
    }
    const args = await functionArgs(entry.functionZid);
    const argVars = new Map(args.map((arg, index) => [arg.key, argName(arg.key, index)]));
    const body = translateTerm(implementation.canonical.Z2K2.Z14K2, { argVars });
    const params = args.map((arg, index) => `(${argName(arg.key, index)}:expr)`).join(" ");
    generated.push(`let generated_${entry.implementationZid.toLowerCase()}_expr ${params} : expr =\n${indent(body, 2)}`);
    provenance.push({
      functionZid: entry.functionZid,
      functionRevision: (await loadObject(entry.functionZid)).revision,
      implementationZid: entry.implementationZid,
      implementationRevision: implementation.revision,
      digest: implementation.digest
    });
  }

  const policyCases = [];
  for (const entry of selected) {
    const args = await functionArgs(entry.functionZid);
    const vars = args.map((arg, index) => argName(arg.key, index));
    policyCases.push(
      `  | F${entry.functionZid}, ${vars.map((name) => `${name} ::`).join(" ")} [] ->\n` +
      `      Body (generated_${entry.implementationZid.toLowerCase()}_expr ${vars.join(" ")})`
    );
  }

  const wrappers = [
    `let eval_generated_z10052 (fuel:nat) (input:text) : Tot (eval_result value) =\n  eval_with_policy generated_policy fuel [] (ECall FZ10052 [EValue (VText input)])`,
    `let eval_generated_z14613 (fuel:nat) (input:text) (old_alphabet:text) (new_alphabet:text) : Tot (eval_result value) =\n  eval_with_policy generated_policy fuel [] (ECall FZ14613 [EValue (VText input); EValue (VText old_alphabet); EValue (VText new_alphabet)])`,
    `let eval_generated_z21679 (fuel:nat) (input:text) : Tot (eval_result value) =\n  eval_with_policy generated_policy fuel [] (ECall FZ21679 [EValue (VText input)])`,
    `let eval_generated_z22294 (fuel:nat) (input:text) : Tot (eval_result value) =\n  eval_with_policy generated_policy fuel [] (ECall FZ22294 [EValue (VText input)])`,
    `let eval_generated_z38114 (fuel:nat) (input:text) : Tot (eval_result value) =\n  eval_with_policy generated_policy fuel [] (ECall FZ38114 [EValue (VText input)])`
  ];

  const source = [
    "module Wikifn.Generated.Compositions",
    "",
    "open Wikifn.Primitive.Kernel",
    "open Wikifn.Composition",
    "",
    "(*",
    "  Generated from pinned local Wikifunctions cache entries.",
    "  Regenerate with: node scripts/generate-fstar-compositions.js",
    "",
    ...provenance.map((entry) =>
      `  ${entry.functionZid}@${entry.functionRevision} -> ${entry.implementationZid}@${entry.implementationRevision} digest ${entry.digest}`
    ),
    "*)",
    "",
    ...generated,
    "",
    "let generated_policy (fid:function_id) (args:list expr) : Tot body_option =",
    "  match fid, args with",
    ...policyCases,
    "  | _, _ -> NoBody",
    "",
    ...wrappers,
    ""
  ].join("\n");

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, source, "utf8");
  console.log(outPath);
}

async function loadObject(zid) {
  if (objectCache.has(zid)) {
    return objectCache.get(zid);
  }
  const dir = path.join(cacheDir, "objects", zid);
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`no cached object found for ${zid}`);
  }
  files.sort((a, b) => Number(path.basename(a, ".json")) - Number(path.basename(b, ".json")));
  const object = JSON.parse(await readFile(path.join(dir, files[files.length - 1]), "utf8"));
  objectCache.set(zid, object);
  return object;
}

async function functionArgs(zid) {
  if (functionCache.has(zid)) {
    return functionCache.get(zid);
  }
  const object = await loadObject(zid);
  const z8 = object.canonical.Z2K2;
  if (z8?.Z1K1 !== "Z8") {
    throw new Error(`${zid} is not a Z8 function`);
  }
  const args = zListItems(z8.Z8K1).map((decl) => {
    const key = z6String(decl.Z17K2);
    if (!key) {
      throw new Error(`${zid} has an argument without a usable Z17K2`);
    }
    return { key };
  });
  functionCache.set(zid, args);
  return args;
}

function translateTerm(term, context) {
  const optimized = translatePrivateUseMarker(term, context);
  if (optimized) {
    return optimized;
  }

  if (typeof term === "string") {
    if (/^Z[1-9][0-9]*$/.test(term)) {
      throw new Error(`unsupported bare reference ${term} in expression position`);
    }
    return `EValue (VText ${textLiteral(term)})`;
  }

  if (Array.isArray(term)) {
    throw new Error("array/list constants are not supported by the selected F* IR generator yet");
  }

  if (!term || typeof term !== "object") {
    throw new Error(`unsupported term ${JSON.stringify(term)}`);
  }

  const type = refZid(term.Z1K1);
  if (type === "Z18") {
    const key = z6String(term.Z18K1);
    const arg = context.argVars.get(key);
    if (!arg) {
      throw new Error(`unbound argument reference ${key}`);
    }
    return arg;
  }

  if (type === "Z7") {
    const functionZid = refZid(term.Z7K1);
    if (!functionZid) {
      throw new Error("Z7K1 is not a supported function reference");
    }
    const argOrder = functionCache.get(functionZid);
    if (!argOrder) {
      throw new Error(`function argument order for ${functionZid} was not preloaded`);
    }
    const args = argOrder.map((arg) => {
      if (!(arg.key in term)) {
        throw new Error(`${functionZid} call is missing ${arg.key}`);
      }
      return translateTerm(term[arg.key], context);
    });
    return `ECall F${functionZid} ${exprList(args)}`;
  }

  if (type === "Z6") {
    const text = z6String(term);
    return `EValue (VText ${textLiteral(text)})`;
  }

  if (type === "Z13518") {
    const raw = z6String(term.Z13518K1);
    if (!/^[0-9]+$/.test(raw)) {
      throw new Error(`unsupported natural literal ${JSON.stringify(raw)}`);
    }
    return `EValue (VNat ${raw})`;
  }

  throw new Error(`unsupported object type ${type ?? JSON.stringify(term.Z1K1)}`);
}

function translatePrivateUseMarker(term, context) {
  if (!term || typeof term !== "object" || refZid(term.Z1K1) !== "Z7" || refZid(term.Z7K1) !== "Z10901") {
    return undefined;
  }
  const firstArg = term.Z10901K1;
  if (!firstArg || refZid(firstArg.Z1K1) !== "Z7" || refZid(firstArg.Z7K1) !== "Z14520") {
    return undefined;
  }
  const range = firstArg.Z14520K1;
  const input = firstArg.Z14520K2;
  if (!range || refZid(range.Z1K1) !== "Z7" || refZid(range.Z7K1) !== "Z14124") {
    return undefined;
  }
  const start = z6String(range.Z14124K1?.Z13518K1);
  const end = z6String(range.Z14124K2?.Z13518K1);
  if (start !== "60928" || end !== "63487") {
    return undefined;
  }
  return `ECall FInternalFreshPrivateUse ${exprList([translateTerm(input, context)])}`;
}

function zListItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("expected canonical list array");
  }
  return value.slice(1);
}

function z6String(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value?.Z1K1 === "Z6" && typeof value.Z6K1 === "string") {
    return value.Z6K1;
  }
  return undefined;
}

function refZid(value) {
  if (typeof value === "string" && /^Z[1-9][0-9]*$/.test(value)) {
    return value;
  }
  if (value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string") {
    return value.Z9K1;
  }
  return undefined;
}

function textLiteral(text) {
  const codepoints = Array.from(text, (char) => char.codePointAt(0));
  return `[${codepoints.join("; ")}]`;
}

function exprList(items) {
  return `[${items.join("; ")}]`;
}

function argName(key, index) {
  return `${key.toLowerCase()}_${index}`;
}

function indent(text, spaces) {
  const prefix = " ".repeat(spaces);
  return text.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

for (const entry of selected) {
  await functionArgs(entry.functionZid);
}
await Promise.all([...selectedByFunction.keys()].map((zid) => functionArgs(zid)));
await Promise.all(["Z802", "Z10008", "Z10075", "Z10901", "Z14124", "Z14456", "Z14520", "Z14613"].map((zid) => functionArgs(zid)));

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

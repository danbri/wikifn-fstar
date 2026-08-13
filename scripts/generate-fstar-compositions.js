#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.join(root, "cache", "wikifunctions");
const outPath = process.env.WIKIFN_GENERATED_FSTAR ?? path.join(root, "src", "fstar", "Wikifn.Generated.Compositions.fst");
const compiledOutPath = process.env.WIKIFN_COMPILED_FSTAR ?? path.join(root, "src", "fstar", "Wikifn.Compiled.Compositions.fst");

const selected = [
  { functionZid: "Z10052", implementationZid: "Z10077", stem: "z10052", compiledName: "compiled_z10052_remove_regular_spaces" },
  { functionZid: "Z10627", implementationZid: "Z21749", stem: "z10627", compiledName: "compiled_z10627_rot13_latin_alphabet" },
  { functionZid: "Z11082", implementationZid: "Z31951", stem: "z11082", compiledName: "compiled_z11082_fallback_if_string_is_empty" },
  { functionZid: "Z14613", implementationZid: "Z36070", stem: "z14613", compiledName: "compiled_z14613_replace_character_set" },
  { functionZid: "Z19612", implementationZid: "Z22828", stem: "z19612", compiledName: "compiled_z19612_turn_to_superscript" },
  { functionZid: "Z21679", implementationZid: "Z21681", stem: "z21679", compiledName: "compiled_z21679_decimal_comma_to_point" },
  { functionZid: "Z22294", implementationZid: "Z22295", stem: "z22294", compiledName: "compiled_z22294_devanagari_digits_to_arabic_digits" },
  { functionZid: "Z22649", implementationZid: "Z22653", stem: "z22649", compiledName: "compiled_z22649_arabic_numerals_to_devanagari_numerals" },
  { functionZid: "Z27053", implementationZid: "Z27216", stem: "z27053", compiledName: "compiled_z27053_digits_to_subscript" },
  { functionZid: "Z38114", implementationZid: "Z38115", stem: "z38114", compiledName: "compiled_z38114_french_contractions" }
];

const selectedByFunction = new Map(selected.map((entry) => [entry.functionZid, entry]));
const functionCache = new Map();
const objectCache = new Map();

async function main() {
  const generated = [];
  const provenance = [];
  const entriesByZid = new Map();

  for (const entry of selected) {
    const implementation = await loadObject(entry.implementationZid);
    entriesByZid.set(entry.functionZid, { ...entry, implementation });
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

  const wrappers = [];
  for (const entry of selected) {
    const args = await functionArgs(entry.functionZid);
    const params = args.map((_arg, index) => `(arg${index}:text)`).join(" ");
    const callArgs = args.map((_arg, index) => `EValue (VText arg${index})`).join("; ");
    wrappers.push(
      `let eval_generated_${entry.stem} (fuel:nat) ${params} : Tot (eval_result value) =\n` +
      `  eval_with_policy generated_policy fuel [] (ECall F${entry.functionZid} [${callArgs}])`
    );
  }

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
  await mkdir(path.dirname(compiledOutPath), { recursive: true });
  await writeFile(compiledOutPath, compiledSource(provenance, entriesByZid), "utf8");
  console.log(outPath);
  console.log(compiledOutPath);
}

function compiledSource(provenance, entriesByZid) {
  const z14613 = entriesByZid.get("Z14613");
  if (!z14613) {
    throw new Error("compiled output requires selected Z14613");
  }

  const ordered = [
    z14613,
    ...selected.filter((entry) => entry.functionZid !== "Z14613").map((entry) => entriesByZid.get(entry.functionZid))
  ];

  const functions = ordered.map((entry) => compileDirectFunction(entry));
  return [
    "module Wikifn.Compiled.Compositions",
    "",
    "open Wikifn.Primitive.Kernel",
    "",
    "(*",
    "  Generated direct F* functions from pinned local Wikifunctions cache entries.",
    "  Regenerate with: node scripts/generate-fstar-compositions.js",
    "  These functions bypass the expression interpreter but still use the same checked primitive kernel.",
    "",
    ...provenance.map((entry) =>
      `  ${entry.functionZid}@${entry.functionRevision} -> ${entry.implementationZid}@${entry.implementationRevision} digest ${entry.digest}`
    ),
    "*)",
    "",
    ...functions,
    ""
  ].join("\n");
}

function compileDirectFunction(entry) {
  const args = functionCache.get(entry.functionZid);
  if (!args) {
    throw new Error(`function argument order for ${entry.functionZid} was not preloaded`);
  }
  const argVars = new Map(args.map((arg, index) => [arg.key, `arg${index}`]));
  const body = entry.implementation.canonical.Z2K2.Z14K2;
  const needsFuel = entry.functionZid === "Z14613" || directUsesFunction(body, "Z14613");
  const context = {
    argVars,
    functionZid: entry.functionZid,
    fuelName: "fuel",
    gensymIndex: 0
  };
  const compiled = compileDirectTerm(body, context);
  const result = asTextResult(compiled);
  const fuelParam = needsFuel ? "(fuel:nat) " : "";
  const params = args.map((_arg, index) => `(arg${index}:text)`).join(" ");
  const signatureParams = `${fuelParam}${params}`.trim();
  const recPrefix = entry.functionZid === "Z14613" ? "rec " : "";
  const decreases = entry.functionZid === "Z14613" ? " (decreases fuel)" : "";
  const bodyExpression = entry.functionZid === "Z14613"
    ? `match fuel with\n  | 0 -> KErr KFuelExhausted\n  | _ ->\n${indent(result, 6)}`
    : result;

  return [
    `let ${recPrefix}${entry.compiledName} ${signatureParams} : Tot (kernel_result text)${decreases} =`,
    indent(bodyExpression, 2)
  ].join("\n");
}

function compileDirectTerm(term, context) {
  const optimized = compileDirectPrivateUseMarker(term, context);
  if (optimized) {
    return optimized;
  }

  if (typeof term === "string") {
    if (/^Z[1-9][0-9]*$/.test(term)) {
      throw new Error(`unsupported bare reference ${term} in compiled expression position`);
    }
    return { kind: "text", code: textLiteral(term) };
  }

  if (Array.isArray(term)) {
    throw new Error("array/list constants are not supported by the selected direct F* compiler yet");
  }

  if (!term || typeof term !== "object") {
    throw new Error(`unsupported compiled term ${JSON.stringify(term)}`);
  }

  const type = refZid(term.Z1K1);
  if (type === "Z18") {
    const key = z6String(term.Z18K1);
    const arg = context.argVars.get(key);
    if (!arg) {
      throw new Error(`unbound compiled argument reference ${key}`);
    }
    return { kind: "text", code: arg };
  }

  if (type === "Z6") {
    return { kind: "text", code: textLiteral(z6String(term)) };
  }

  if (type === "Z13518") {
    const raw = z6String(term.Z13518K1);
    if (!/^[0-9]+$/.test(raw)) {
      throw new Error(`unsupported compiled natural literal ${JSON.stringify(raw)}`);
    }
    return { kind: "nat", code: raw };
  }

  if (type !== "Z7") {
    throw new Error(`unsupported compiled object type ${type ?? JSON.stringify(term.Z1K1)}`);
  }

  const functionZid = refZid(term.Z7K1);
  switch (functionZid) {
    case "Z802":
      return compileDirectIf(term, context);
    case "Z10008":
      return compileDirectIsEmpty(term, context);
    case "Z10075":
      return compileDirectReplaceAll(term, context);
    case "Z10901":
      return compileDirectUnaryText(term.Z10901K1, context, "z10901_get_first_character");
    case "Z14124":
      return compileDirectUnicodeRange(term, context);
    case "Z14456":
      return compileDirectUnaryText(term.Z14456K1, context, "z14456_remove_first_character");
    case "Z14520":
      return compileDirectRemoveChars(term, context);
    case "Z14613":
      return compileDirectZ14613(term, context);
    default:
      throw new Error(`unsupported compiled function call ${functionZid}`);
  }
}

function compileDirectPrivateUseMarker(term, context) {
  if (!term || typeof term !== "object" || refZid(term.Z1K1) !== "Z7" || refZid(term.Z7K1) !== "Z10901") {
    return undefined;
  }
  const firstArg = term.Z10901K1;
  if (!firstArg || refZid(firstArg.Z1K1) !== "Z7" || refZid(firstArg.Z7K1) !== "Z14520") {
    return undefined;
  }
  const range = firstArg.Z14520K1;
  const inputTerm = firstArg.Z14520K2;
  if (!range || refZid(range.Z1K1) !== "Z7" || refZid(range.Z7K1) !== "Z14124") {
    return undefined;
  }
  const start = z6String(range.Z14124K1?.Z13518K1);
  const end = z6String(range.Z14124K2?.Z13518K1);
  if (start !== "60928" || end !== "63487") {
    return undefined;
  }
  const input = compileDirectTerm(inputTerm, context);
  if (input.kind === "text") {
    return {
      kind: "text",
      code: `z36070_first_available_private_use_character ${paren(input.code)}`
    };
  }
  if (input.kind === "text_result") {
    return bindText(input, context, "fresh_input", (name) =>
      `KOk (z36070_first_available_private_use_character ${name})`);
  }
  throw new Error("compiled private-use marker input did not produce text");
}

function compileDirectIf(term, context) {
  const condition = compileDirectTerm(term.Z802K1, context);
  if (condition.kind !== "bool") {
    throw new Error("compiled Z802 condition did not produce bool");
  }
  const thenBranch = asTextResult(compileDirectTerm(term.Z802K2, context));
  const elseBranch = asTextResult(compileDirectTerm(term.Z802K3, context));
  return {
    kind: "text_result",
    code: `if ${paren(condition.code)} then\n  ${indent(thenBranch, 2)}\nelse\n  ${indent(elseBranch, 2)}`
  };
}

function compileDirectIsEmpty(term, context) {
  const input = compileDirectTerm(term.Z10008K1, context);
  if (input.kind !== "text") {
    throw new Error("compiled Z10008 input did not produce text");
  }
  return { kind: "bool", code: `z10008_is_empty_string ${paren(input.code)}` };
}

function compileDirectReplaceAll(term, context) {
  return bindText(compileDirectTerm(term.Z10075K1, context), context, "input", (input) =>
    bindText(compileDirectTerm(term.Z10075K2, context), context, "substring", (substring) =>
      bindText(compileDirectTerm(term.Z10075K3, context), context, "replacement", (replacement) =>
        `z10075_replace_all_substrings ${input} ${substring} ${replacement}`)));
}

function compileDirectZ14613(term, context) {
  return bindText(compileDirectTerm(term.Z14613K1, context), context, "input", (input) =>
    bindText(compileDirectTerm(term.Z14613K2, context), context, "old_alphabet", (oldAlphabet) =>
      bindText(compileDirectTerm(term.Z14613K3, context), context, "new_alphabet", (newAlphabet) => {
        const fuel = context.functionZid === "Z14613" ? `(${context.fuelName} - 1)` : context.fuelName;
        return `compiled_z14613_replace_character_set ${fuel} ${input} ${oldAlphabet} ${newAlphabet}`;
      })));
}

function compileDirectUnaryText(inputTerm, context, functionName) {
  const input = compileDirectTerm(inputTerm, context);
  if (input.kind !== "text") {
    throw new Error(`compiled ${functionName} input did not produce text`);
  }
  return { kind: "text", code: `${functionName} ${paren(input.code)}` };
}

function compileDirectUnicodeRange(term, context) {
  const first = compileDirectTerm(term.Z14124K1, context);
  const last = compileDirectTerm(term.Z14124K2, context);
  if (first.kind !== "nat" || last.kind !== "nat") {
    throw new Error("compiled Z14124 bounds did not produce nat");
  }
  return {
    kind: "text",
    code: `z14124_string_of_characters_from_unicode_range ${paren(first.code)} ${paren(last.code)}`
  };
}

function compileDirectRemoveChars(term, context) {
  const input = compileDirectTerm(term.Z14520K1, context);
  const chars = compileDirectTerm(term.Z14520K2, context);
  if (input.kind !== "text" || chars.kind !== "text") {
    throw new Error("compiled Z14520 inputs did not produce text");
  }
  return {
    kind: "text",
    code: `z14520_remove_all_characters_in_second_string ${paren(input.code)} ${paren(chars.code)}`
  };
}

function bindText(compiled, context, nameHint, body) {
  if (compiled.kind === "text") {
    return { kind: "text_result", code: toTextResultCode(body(paren(compiled.code))) };
  }
  if (compiled.kind !== "text_result") {
    throw new Error(`expected compiled text or text_result, got ${compiled.kind}`);
  }
  const name = gensym(context, nameHint);
  const bodyCode = toTextResultCode(body(name));
  return {
    kind: "text_result",
    code: `bind_kernel\n  (${indent(compiled.code, 2).trim()})\n  (fun ${name} ->\n${indent(bodyCode, 4)})`
  };
}

function toTextResultCode(value) {
  if (typeof value === "string") {
    return value;
  }
  return asTextResult(value);
}

function asTextResult(compiled) {
  if (compiled.kind === "text") {
    return `KOk ${paren(compiled.code)}`;
  }
  if (compiled.kind === "text_result") {
    return compiled.code;
  }
  throw new Error(`expected text result, got ${compiled.kind}`);
}

function directUsesFunction(term, zid) {
  if (!term || typeof term !== "object") {
    return false;
  }
  if (Array.isArray(term)) {
    return term.some((item) => directUsesFunction(item, zid));
  }
  if (refZid(term.Z1K1) === "Z7" && refZid(term.Z7K1) === zid) {
    return true;
  }
  return Object.values(term).some((value) => directUsesFunction(value, zid));
}

function gensym(context, nameHint) {
  const safeHint = nameHint.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const name = `${safeHint}_${context.gensymIndex}`;
  context.gensymIndex += 1;
  return name;
}

function paren(code) {
  if (/^[a-z][a-z0-9_]*$/i.test(code) || /^[0-9]+$/.test(code) || /^\[[^\n]*\]$/.test(code)) {
    return code;
  }
  return `(${code})`;
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

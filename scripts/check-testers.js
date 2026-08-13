#!/usr/bin/env node
// Check the extracted F* artifact against Wikifunctions' own testers (Z20).
//
// For each tester of each requested function this takes the tester's call
// object (Z20K2) verbatim, runs it through the extracted F* evaluator, and
// checks the result against the tester's validation call (Z20K3).
//
// A tester whose validator this cannot interpret is reported as skipped, never
// as passed.
//
//   node scripts/check-testers.js [--json] [--zid Z22294,Z10627] [--mode all]

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = process.env.WIKIFN_CACHE_DIR ?? path.join(root, "cache", "wikifunctions");
const artifactPath = path.join(root, "docs", "generated", "wikifn_call_browser.js");

const MODES = ["generated", "compiled", "specialized"];

export async function loadArtifact() {
  require(artifactPath);
  if (typeof globalThis.wikifnFstarEvalZObject !== "function") {
    throw new Error(`${artifactPath} did not export wikifnFstarEvalZObject`);
  }
  return {
    evalZObject: (object) => JSON.parse(globalThis.wikifnFstarEvalZObject(JSON.stringify(object))),
    call: (mode, zid, fuel, arg0, arg1) =>
      JSON.parse(globalThis.wikifnFstarCall(mode, zid, fuel, arg0 ?? "", arg1 ?? "")),
    supported: JSON.parse(globalThis.wikifnFstarSupported()).supported ?? []
  };
}

async function loadCanonical(zid) {
  const dir = path.join(cacheDir, "objects", zid);
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  if (files.length === 0) throw new Error(`no cached object for ${zid}`);
  files.sort((a, b) => Number(path.basename(a, ".json")) - Number(path.basename(b, ".json")));
  const entry = JSON.parse(await readFile(path.join(dir, files[files.length - 1]), "utf8"));
  return { canonical: entry.canonical, revision: entry.revision };
}

export async function testerZidsFor(functionZids) {
  const list = functionZids.map((zid) => `'${zid}'`).join(",");
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(root, "bin", "wikifn.js"), "db", "query", "--format", "json",
    `select function_zid, tester_zid from function_testers where function_zid in (${list}) order by function_zid, ordinal`
  ], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function refZid(value) {
  if (typeof value === "string" && /^Z[1-9][0-9]*$/.test(value)) return value;
  if (value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string") return value.Z9K1;
  return undefined;
}

// A bare string that looks like a ZID is a reference to another object, not a
// literal. Those are resolved from the cache; anything else that is not a plain
// string has no literal value.
function stringOf(value) {
  if (typeof value === "string") {
    return /^Z[1-9][0-9]*$/.test(value) ? { reference: value } : value;
  }
  if (value?.Z1K1 === "Z6" && typeof value.Z6K1 === "string") return value.Z6K1;
  if (value?.Z1K1 === "Z9" && typeof value.Z9K1 === "string") return { reference: value.Z9K1 };
  return undefined;
}

async function resolveString(value) {
  const resolved = stringOf(value);
  if (typeof resolved === "string" || resolved === undefined) return resolved;
  const target = await loadCanonical(resolved.reference).catch(() => undefined);
  if (!target) return undefined;
  return stringOf(target.canonical.Z2K2);
}

// Argument keys of a call object, ordered by the numeric suffix that
// Wikifunctions keys carry (Z22294K1, Z22294K2, ...).
function callArguments(call) {
  return Object.keys(call)
    .filter((key) => key !== "Z1K1" && key !== "Z7K1")
    .sort((a, b) => Number(a.split("K")[1]) - Number(b.split("K")[1]))
    .map((key) => call[key]);
}

// Read the tester's validation call. Z20K3 is a call with one argument left
// empty; the evaluator fills it with the result under test. Anything this does
// not recognise is reported, not guessed at.
async function expectationOf(validator) {
  const validatorZid = refZid(validator?.Z7K1);
  if (validatorZid === "Z866" || validatorZid === "Z844") {
    const given = ["Z866K1", "Z866K2", "Z844K1", "Z844K2"]
      .filter((key) => key in validator)
      .map((key) => validator[key]);
    if (given.length !== 1) {
      return { kind: "unsupported", reason: `${validatorZid} with ${given.length} supplied arguments` };
    }
    const text = await resolveString(given[0]);
    if (text === undefined) {
      return { kind: "unsupported", reason: `${validatorZid} expected value is not a resolvable string` };
    }
    return { kind: "text_equals", expected: text };
  }
  return { kind: "unsupported", reason: `validator ${validatorZid ?? JSON.stringify(validator?.Z7K1)}` };
}

function resultText(response) {
  const value = response?.result?.value;
  if (!value || value.type !== "Z6") return undefined;
  return value.text;
}

export async function checkTesters(functionZids, { modes = ["zobject"], maxInput = 0 } = {}) {
  const artifact = await loadArtifact();
  const rows = await testerZidsFor(functionZids);
  const cases = [];

  for (const row of rows) {
    const tester = await loadCanonical(row.tester_zid);
    const body = tester.canonical.Z2K2;
    if (refZid(body?.Z1K1) !== "Z20") {
      cases.push({ ...row, status: "skipped", reason: "not a Z20 tester" });
      continue;
    }
    const call = body.Z20K2;
    const expectation = await expectationOf(body.Z20K3);
    if (expectation.kind === "unsupported") {
      cases.push({ ...row, tester_revision: tester.revision, status: "skipped", reason: expectation.reason });
      continue;
    }

    const args = [];
    for (const argument of callArguments(call)) {
      args.push(await resolveString(argument));
    }
    // The fixed-signature entry points take literal text only. A tester whose
    // argument is itself a call can still go through the Z7 adapter.
    const literalArgs = args.every((argument) => typeof argument === "string");
    const inputLength = args.reduce(
      (total, argument) => total + (typeof argument === "string" ? [...argument].length : 0),
      0
    );
    if (maxInput > 0 && inputLength > maxInput) {
      cases.push({
        ...row,
        tester_revision: tester.revision,
        status: "skipped",
        reason: `input of ${inputLength} characters exceeds maxInput ${maxInput}`
      });
      continue;
    }
    const base = {
      ...row,
      tester_revision: tester.revision,
      input: args,
      expected: expectation.expected
    };

    // The adapter resolves no references, so any argument this harness already
    // resolved is passed as an explicit Z6 literal.
    const adapterCall = { ...call };
    const argumentKeys = Object.keys(call)
      .filter((key) => key !== "Z1K1" && key !== "Z7K1")
      .sort((a, b) => Number(a.split("K")[1]) - Number(b.split("K")[1]));
    argumentKeys.forEach((key, index) => {
      if (typeof args[index] === "string") {
        adapterCall[key] = { Z1K1: "Z6", Z6K1: args[index] };
      }
    });

    for (const mode of modes) {
      if (mode !== "zobject" && !literalArgs) {
        cases.push({ ...base, mode, status: "skipped", reason: "argument is a nested call, not literal text" });
        continue;
      }
      let response;
      try {
        response = mode === "zobject"
          ? artifact.evalZObject(adapterCall)
          : artifact.call(mode, row.function_zid, 500, args[0], args[1]);
      } catch (error) {
        cases.push({ ...base, mode, status: "error", reason: String(error.message ?? error) });
        continue;
      }
      if (!response.ok || !response.result?.ok) {
        cases.push({
          ...base,
          mode,
          status: "error",
          reason: response.message ?? response.result?.error ?? "evaluation failed"
        });
        continue;
      }
      const actual = resultText(response);
      cases.push({
        ...base,
        mode,
        actual,
        status: actual === expectation.expected ? "pass" : "fail"
      });
    }
  }

  const tally = (status) => cases.filter((entry) => entry.status === status).length;
  return {
    functions: functionZids,
    modes,
    counts: {
      total: cases.length,
      pass: tally("pass"),
      fail: tally("fail"),
      error: tally("error"),
      skipped: tally("skipped")
    },
    cases
  };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const zidArg = valueOf(args, "--zid");
  const modeArg = valueOf(args, "--mode") ?? "zobject";
  const modes = modeArg === "all" ? ["zobject", ...MODES] : modeArg.split(",");

  const artifact = await loadArtifact();
  const functionZids = zidArg
    ? zidArg.split(",")
    : artifact.supported.map((entry) => entry.zid);

  const report = await checkTesters(functionZids, { modes });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const entry of report.cases) {
      if (entry.status === "pass") continue;
      console.log(
        `${entry.status.toUpperCase().padEnd(8)} ${entry.function_zid} ${entry.tester_zid}` +
        `${entry.mode ? ` [${entry.mode}]` : ""} ${entry.reason ?? `expected ${JSON.stringify(entry.expected)}, got ${JSON.stringify(entry.actual)}`}`
      );
    }
    const { total, pass, fail, error, skipped } = report.counts;
    console.log(`\n${pass}/${total} pass, ${fail} fail, ${error} error, ${skipped} skipped`);
  }

  process.exit(report.counts.fail > 0 || report.counts.error > 0 ? 1 : 0);
}

function valueOf(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(error.stack ?? String(error));
    process.exit(1);
  });
}

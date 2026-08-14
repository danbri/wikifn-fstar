#!/usr/bin/env node
// Check every generated composition body as its own F* module, in parallel.
//
// The part modules under src/fstar/ are what extracts to OCaml. These are what
// verifies. The difference matters for three reasons:
//
//   Isolation. A body F* cannot check fails on its own here. In a part module
//   it takes the other few hundred with it, and the failure says nothing about
//   which body caused it. That is how Z24460 - the whole Unicode
//   Extended_Pictographic table inline as a codepoint list - was found.
//
//   Incrementality. F* skips a module whose .checked file is current, so a
//   regeneration re-checks only the functions whose bodies actually changed.
//
//   Parallelism. There are no dependencies between bodies: a call is a ZID
//   number the evaluator resolves at run time, not a module reference. Every
//   module depends only on Wikifn.Eval. So they can be checked in any order,
//   in any number at once, on any number of machines.
//
//   node scripts/verify-fstar-functions.js [--jobs N] [--limit N] [--only ZID,ZID]
//                                          [--timeout SECONDS] [--out FILE]
//
// Exits non-zero if any function fails, after checking all of them, so one bad
// body does not hide the rest.

import { execFile } from "node:child_process";
import { availableParallelism } from "node:os";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionDir = path.join(root, "build", "fstar", "fn");
const includeDir = path.join(root, "src", "fstar");

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

// Two cores left for the rest of the machine. F* is one process per module and
// each one is small, so the limit is cores rather than memory.
const jobs = Number(valueOf("--jobs") ?? Math.max(1, availableParallelism() - 2));
const limit = Number(valueOf("--limit") ?? 0);
const timeoutSeconds = Number(valueOf("--timeout") ?? 300);
const only = valueOf("--only")?.split(",").map((zid) => zid.trim()).filter(Boolean);
const outPath = valueOf("--out") ?? path.join(root, "build", "fstar", "function-verification.json");

async function fstarCommand() {
  for (const candidate of ["fstar.exe", "fstar"]) {
    try {
      await run(candidate, ["--version"], 30);
      return { command: candidate, prefix: [] };
    } catch { /* try the next one */ }
  }
  try {
    await run("opam", ["exec", "--switch=fstar", "--", "fstar.exe", "--version"], 60);
    return { command: "opam", prefix: ["exec", "--switch=fstar", "--", "fstar.exe"] };
  } catch {
    throw new Error(
      "F* not found. Put fstar.exe on PATH or install it in the opam switch named fstar."
    );
  }
}

function run(command, commandArgs, seconds) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      commandArgs,
      { timeout: seconds * 1000, maxBuffer: 8 * 1024 * 1024, killSignal: "SIGKILL" },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stdout, stderr }));
        else resolve({ stdout, stderr });
      }
    );
  });
}

// A verification failure and a crash are different things and are reported as
// different things. F* dying on a signal - out of memory, or out of stack on a
// term too large - says nothing about whether the body is correct.
function failureOf(error) {
  if (error.killed || error.signal) {
    return error.signal === "SIGTERM" || error.killed
      ? `killed after ${timeoutSeconds}s`
      : `killed by ${error.signal}`;
  }
  const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  const first = text.split("\n").find((line) => /error|Error/.test(line));
  return first?.trim() || `exit ${error.code ?? "unknown"}`;
}

async function main() {
  let files;
  try {
    files = (await readdir(functionDir)).filter((name) => /^Wikifn\.Fn\.Z\d+\.fst$/.test(name));
  } catch {
    console.error(`No modules in ${functionDir}. Run: make fstar-generate-eval`);
    process.exit(1);
  }
  files.sort((a, b) => Number(a.match(/Z(\d+)/)[1]) - Number(b.match(/Z(\d+)/)[1]));
  if (only) files = files.filter((name) => only.includes(name.match(/Wikifn\.Fn\.(Z\d+)\./)[1]));
  if (limit) files = files.slice(0, limit);

  const { command, prefix } = await fstarCommand();

  // Check the modules every function module depends on, once, before fanning
  // out. Without this each worker re-verifies Wikifn.Eval from scratch and they
  // all race to write the same .checked file: measured at no progress at all in
  // the first minute, against seconds per function once the base is warm.
  console.log("warming the base modules");
  for (const base of ["Wikifn.Primitive.Kernel", "Wikifn.Zid", "Wikifn.Eval"]) {
    await run(
      command,
      [...prefix, "--cache_checked_modules", "--include", includeDir,
        path.join(includeDir, `${base}.fst`)],
      1800
    );
  }

  console.log(`${files.length} functions, ${jobs} at a time`);

  const results = [];
  let next = 0;
  let failures = 0;
  const started = Date.now();

  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      const zid = file.match(/Wikifn\.Fn\.(Z\d+)\./)[1];
      const began = Date.now();
      let entry;
      try {
        await run(
          command,
          [...prefix, "--cache_checked_modules", "--include", includeDir, "--include", functionDir,
            path.join(functionDir, file)],
          timeoutSeconds
        );
        entry = { zid, ok: true, seconds: (Date.now() - began) / 1000 };
      } catch (error) {
        entry = { zid, ok: false, seconds: (Date.now() - began) / 1000, reason: failureOf(error) };
        failures += 1;
        console.log(`  FAILED ${zid}: ${entry.reason}`);
      }
      results.push(entry);
      if (results.length % 200 === 0) {
        console.log(`  ${results.length}/${files.length}, ${failures} failed`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  results.sort((a, b) => Number(a.zid.slice(1)) - Number(b.zid.slice(1)));

  const elapsed = (Date.now() - started) / 1000;
  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 10);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generated: "scripts/verify-fstar-functions.js",
        jobs,
        checked: results.length,
        verified: results.length - failures,
        failed: failures,
        wallSeconds: elapsed,
        slowest: slowest.map(({ zid, seconds }) => ({ zid, seconds })),
        failures: results.filter((entry) => !entry.ok),
        results
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `${results.length - failures} verified, ${failures} failed, ${elapsed.toFixed(1)}s wall`
  );
  console.log(outPath);
  if (failures) process.exit(1);
}

await main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});

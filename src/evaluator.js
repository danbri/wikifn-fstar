import { builtinFunctions, readBoolean } from "./builtins.js";
import { err, ok } from "./result.js";
import { getField, refZid, stringValue, toCanonicalJson, typeZid } from "./zterm.js";

const CALL_TYPE = "Z7";
const ARG_REF_TYPE = "Z18";
const IF_FUNCTION = "Z802";

export function evaluate(world, term, options = {}) {
  const state = {
    fuel: options.fuel ?? 100,
    builtins: options.builtins ?? builtinFunctions,
    trace: []
  };
  const result = evaluateTerm(world, term, new Map(), state, ["$"]);
  if (!result.ok) {
    return result;
  }
  return ok({
    value: result.value,
    fuelRemaining: state.fuel,
    trace: state.trace
  });
}

function evaluateTerm(world, term, env, state, path) {
  if (term.kind === "ref") {
    return evaluateReference(world, term.zid, env, state, path);
  }
  if (term.kind !== "record") {
    return ok(term);
  }

  const type = typeZid(term);
  if (type === ARG_REF_TYPE) {
    return evaluateArgumentReference(term, env, path);
  }
  if (type === CALL_TYPE) {
    return evaluateCall(world, term, env, state, path);
  }

  const evaluated = [];
  for (const [key, value] of term.fields) {
    if (key === "Z1K1") {
      evaluated.push([key, value]);
      continue;
    }
    const child = evaluateTerm(world, value, env, state, path.concat(key));
    if (!child.ok) {
      return child;
    }
    evaluated.push([key, child.value]);
  }
  return ok({ kind: "record", fields: evaluated });
}

function evaluateReference(world, zid, env, state, path) {
  const resolved = world.resolveValue(zid);
  if (!resolved.ok) {
    return ok({ kind: "ref", zid });
  }
  state.trace.push({ kind: "resolve", zid });
  return evaluateTerm(world, resolved.value, env, state, path);
}

function evaluateArgumentReference(term, env, path) {
  const key = stringValue(getField(term, "Z18K1"));
  if (!key) {
    return err("invalid_argument_reference", "Z18K1 must be a string key", path.concat("Z18K1"));
  }
  if (!env.has(key)) {
    return err("unbound_argument", `argument ${key} is not bound`, path.concat("Z18K1"));
  }
  return ok(env.get(key));
}

function evaluateCall(world, call, env, state, path) {
  if (state.fuel <= 0) {
    return err("fuel_exhausted", "evaluation fuel exhausted", path);
  }
  state.fuel -= 1;

  const functionZid = refZid(getField(call, "Z7K1"));
  if (!functionZid) {
    return err("invalid_call", "Z7K1 must be a function reference", path.concat("Z7K1"));
  }
  state.trace.push({ kind: "call", functionZid, fuelRemaining: state.fuel });

  if (functionZid === IF_FUNCTION) {
    return evaluateIf(world, call, env, state, path);
  }

  const evaluatedArgs = evaluateCallArguments(world, call, env, state, path);
  if (!evaluatedArgs.ok) {
    return evaluatedArgs;
  }

  const builtin = state.builtins.get(functionZid);
  if (builtin) {
    return builtin(evaluatedArgs.value, path);
  }

  const selected = selectCompositionImplementation(world, functionZid);
  if (!selected.ok) {
    return selected;
  }

  const childEnv = new Map(evaluatedArgs.value);
  state.trace.push({
    kind: "composition",
    functionZid,
    implementationZid: selected.value.zid,
    implementationRevision: selected.value.revision
  });
  return evaluateTerm(world, selected.value.composition, childEnv, state, path.concat(`composition:${selected.value.zid}`));
}

function evaluateCallArguments(world, call, env, state, path) {
  const args = new Map();
  for (const [key, value] of call.fields) {
    if (key === "Z1K1" || key === "Z7K1") {
      continue;
    }
    const evaluated = evaluateTerm(world, value, env, state, path.concat(key));
    if (!evaluated.ok) {
      return evaluated;
    }
    args.set(key, evaluated.value);
  }
  return ok(args);
}

function evaluateIf(world, call, env, state, path) {
  const conditionTerm = getField(call, "Z802K1");
  const consequentTerm = getField(call, "Z802K2");
  const alternativeTerm = getField(call, "Z802K3");
  if (!conditionTerm || !consequentTerm || !alternativeTerm) {
    return err("missing_argument", "Z802/if requires Z802K1, Z802K2, and Z802K3", path);
  }

  const condition = evaluateTerm(world, conditionTerm, env, state, path.concat("Z802K1"));
  if (!condition.ok) {
    return condition;
  }
  const flag = readBoolean(condition.value, path.concat("Z802K1"));
  if (!flag.ok) {
    return flag;
  }
  return evaluateTerm(world, flag.value ? consequentTerm : alternativeTerm, env, state, path.concat(flag.value ? "Z802K2" : "Z802K3"));
}

function selectCompositionImplementation(world, functionZid) {
  const implementations = world.compositionImplementations(functionZid);
  if (implementations.length === 0) {
    return err("no_implementation", `no composition implementation available for ${functionZid}`);
  }
  return ok(implementations[0]);
}

export function evaluationSummary(result) {
  if (!result.ok) {
    return result;
  }
  return ok({
    value: toCanonicalJson(result.value.value),
    fuelRemaining: result.value.fuelRemaining,
    calls: result.value.trace.filter((entry) => entry.kind === "call").length,
    implementations: result.value.trace
      .filter((entry) => entry.kind === "composition")
      .map((entry) => `${entry.functionZid}@${entry.implementationZid}:${entry.implementationRevision}`)
  });
}

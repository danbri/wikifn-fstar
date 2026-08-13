import { builtinFunctions, readBoolean } from "./builtins.js";
import { err, ok } from "./result.js";
import { describeTerm, getField, refZid, stringValue, toCanonicalJson, typeZid } from "./zterm.js";

const CALL_TYPE = "Z7";
const ARG_REF_TYPE = "Z18";
const IF_FUNCTION = "Z802";

export function evaluate(world, term, options = {}) {
  const state = {
    fuelStart: options.fuel ?? 100,
    fuel: options.fuel ?? 100,
    builtins: options.builtins ?? builtinFunctions,
    trace: [],
    callStack: [],
    maxCallDepth: 0
  };
  const result = evaluateTerm(world, term, new Map(), state, ["$"]);
  if (!result.ok) {
    return result;
  }
  return ok({
    value: result.value,
    fuelStart: state.fuelStart,
    fuelRemaining: state.fuel,
    maxCallDepth: state.maxCallDepth,
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
  const object = world.get(zid);
  if (!object) {
    return ok({ kind: "ref", zid });
  }
  state.trace.push({
    kind: "resolve",
    zid,
    revision: object.revision,
    path: renderPath(path),
    depth: state.callStack.length
  });
  return evaluateTerm(world, object.value, env, state, path);
}

function evaluateArgumentReference(term, env, path) {
  const key = stringValue(getField(term, "Z18K1"));
  if (!key) {
    return err("invalid_argument_reference", "Z18K1 must be a string key", path.concat("Z18K1"));
  }
  if (!env.has(key)) {
    return err("unbound_argument", `argument ${key} is not bound`, path.concat("Z18K1"));
  }
  const value = env.get(key);
  return ok(value);
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

  return withCallFrame(state, functionZid, () => {
    state.trace.push({
      kind: "call",
      functionZid,
      fuelRemaining: state.fuel,
      path: renderPath(path),
      depth: state.callStack.length - 1
    });

    if (functionZid === IF_FUNCTION) {
      return evaluateIf(world, call, env, state, path);
    }

    const evaluatedArgs = evaluateCallArguments(world, call, env, state, path);
    if (!evaluatedArgs.ok) {
      return evaluatedArgs;
    }

    const builtin = state.builtins.get(functionZid);
    if (builtin) {
      const result = builtin(evaluatedArgs.value, path);
      state.trace.push({
        kind: "builtin",
        functionZid,
        path: renderPath(path),
        depth: state.callStack.length - 1,
        ok: result.ok,
        result: result.ok ? describeTerm(result.value) : result.error.code
      });
      return result;
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
      implementationRevision: selected.value.revision,
      path: renderPath(path),
      depth: state.callStack.length - 1,
      arguments: [...childEnv.keys()].sort()
    });
    return evaluateTerm(world, selected.value.composition, childEnv, state, path.concat(`composition:${selected.value.zid}`));
  });
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
    state.trace.push({
      kind: "argument",
      key,
      path: renderPath(path.concat(key)),
      depth: state.callStack.length,
      value: describeTerm(evaluated.value)
    });
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
  state.trace.push({
    kind: "branch",
    functionZid: IF_FUNCTION,
    condition: flag.value,
    selected: flag.value ? "then" : "else",
    path: renderPath(path),
    depth: state.callStack.length - 1
  });
  return evaluateTerm(world, flag.value ? consequentTerm : alternativeTerm, env, state, path.concat(flag.value ? "Z802K2" : "Z802K3"));
}

function withCallFrame(state, functionZid, f) {
  state.callStack.push(functionZid);
  state.maxCallDepth = Math.max(state.maxCallDepth, state.callStack.length);
  const result = f();
  state.callStack.pop();
  return result;
}

function selectCompositionImplementation(world, functionZid) {
  const implementations = world.compositionImplementations(functionZid);
  if (implementations.length === 0) {
    return err("no_implementation", `no composition implementation available for ${functionZid}`);
  }
  return ok(implementations[0]);
}

export function evaluationSummary(result, options = {}) {
  if (!result.ok) {
    return result;
  }
  const trace = result.value.trace;
  const summary = {
    value: toCanonicalJson(result.value.value),
    fuelRemaining: result.value.fuelRemaining,
    calls: trace.filter((entry) => entry.kind === "call").length,
    implementations: trace
      .filter((entry) => entry.kind === "composition")
      .map((entry) => `${entry.functionZid}@${entry.implementationZid}:${entry.implementationRevision}`),
    stats: {
      fuelStart: result.value.fuelStart,
      fuelUsed: result.value.fuelStart - result.value.fuelRemaining,
      maxCallDepth: result.value.maxCallDepth,
      builtins: trace.filter((entry) => entry.kind === "builtin").length,
      compositions: trace.filter((entry) => entry.kind === "composition").length,
      resolvedReferences: trace.filter((entry) => entry.kind === "resolve").length,
      argumentsEvaluated: trace.filter((entry) => entry.kind === "argument").length,
      branches: trace.filter((entry) => entry.kind === "branch").length
    }
  };
  if (options.trace) {
    summary.trace = trace;
  }
  return ok(summary);
}

function renderPath(path) {
  return path.join(".");
}

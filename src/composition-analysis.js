import { isBuiltinZid, isZid } from "./ids.js";
import { normalizeCanonical } from "./normalize.js";
import { err, ok } from "./result.js";
import { buildObjectVersion } from "./world.js";
import { fetchPinnedZObjects } from "./wikifunctions-api.js";
import { getField, refZid, stringValue, toCanonicalJson, typeZid, zListItems } from "./zterm.js";

export const defaultVerifiedPrimitives = new Set(["Z782", "Z783", "Z784", "Z801", "Z802"]);

export async function fetchAnalysisCorpus(seedZids, options = {}) {
  const fetcher = options.fetcher ?? fetchPinnedZObjects;
  const maxObjects = options.maxObjects ?? 300;
  const followCompositionCalls = options.followCompositionCalls ?? false;
  const corpus = new AnalysisCorpus();
  const queue = [...new Set(seedZids)];
  const queued = new Set(queue);

  while (queue.length > 0) {
    if (corpus.objects.size >= maxObjects) {
      return err("analysis_limit", `analysis stopped after ${maxObjects} objects`, ["$"], {
        fetchedObjects: corpus.objects.size,
        remainingQueue: queue
      });
    }

    const batch = queue.splice(0, options.batchSize ?? 25).filter((zid) => !corpus.objects.has(zid));
    if (batch.length === 0) {
      continue;
    }

    const fetched = await fetcher(batch, options.api ?? {});
    if (!fetched.ok) {
      return fetched;
    }

    for (const entry of fetched.value) {
      const classified = classifyFetchedObject(entry);
      if (!classified.ok) {
        return classified;
      }
      corpus.add(classified.value);
    }

    for (const zid of batch) {
      const object = corpus.objects.get(zid);
      if (!object) {
        continue;
      }
      for (const dependency of semanticDependencies(object, { followCompositionCalls })) {
        if (!queued.has(dependency) && !corpus.objects.has(dependency) && !isBuiltinZid(dependency)) {
          queued.add(dependency);
          queue.push(dependency);
        }
      }
    }
  }

  return ok(corpus);
}

export function analyzeSeeds(corpus, seedZids, options = {}) {
  const primitives = normalizePrimitiveSet(options.primitives);
  return {
    seeds: seedZids,
    primitives: [...primitives].sort(),
    fetchedObjects: corpus.objects.size,
    results: seedZids.map((zid) => analyzeSeed(corpus, zid, primitives)),
    objects: corpusSummary(corpus)
  };
}

export function classifyFetchedObject(entry) {
  const objectVersion = buildObjectVersion(entry, ["$", entry.zid]);
  if (!objectVersion.ok) {
    return objectVersion;
  }
  return ok(classifyObjectVersion(objectVersion.value, entry));
}

export function classifyCanonicalObject(zid, revision, canonical) {
  return classifyFetchedObject({ zid, revision, canonical });
}

export function collectCompositionCalls(term, path = ["$"], calls = [], dynamicCalls = []) {
  if (!term || term.kind !== "record") {
    return { calls, dynamicCalls };
  }

  if (typeZid(term) === "Z7") {
    const functionTerm = getField(term, "Z7K1");
    const functionZid = refZid(functionTerm);
    if (functionZid) {
      calls.push({ functionZid, path: path.concat("Z7K1").join(".") });
    } else {
      dynamicCalls.push({ path: path.concat("Z7K1").join("."), term: functionTerm ? toCanonicalJson(functionTerm) : null });
    }

    for (const [key, value] of term.fields) {
      if (key === "Z1K1" || key === "Z7K1") {
        continue;
      }
      collectCompositionCalls(value, path.concat(key), calls, dynamicCalls);
    }
    return { calls, dynamicCalls };
  }

  for (const [key, value] of term.fields) {
    if (key === "Z1K1") {
      continue;
    }
    collectCompositionCalls(value, path.concat(key), calls, dynamicCalls);
  }
  return { calls, dynamicCalls };
}

class AnalysisCorpus {
  constructor() {
    this.objects = new Map();
  }

  add(object) {
    this.objects.set(object.zid, object);
  }

  get(zid) {
    return this.objects.get(zid);
  }
}

function classifyObjectVersion(objectVersion, sourceEntry) {
  const value = objectVersion.value;
  const ztype = typeZid(value);
  const base = {
    zid: objectVersion.zid,
    revision: objectVersion.revision,
    digest: objectVersion.digest,
    timestamp: sourceEntry.timestamp,
    user: sourceEntry.user,
    ztype
  };

  if (ztype === "Z8") {
    return {
      ...base,
      kind: "function",
      implementationZids: listRefs(getField(value, "Z8K4")),
      testerZids: listRefs(getField(value, "Z8K3")),
      returnType: getField(value, "Z8K2") ? toCanonicalJson(getField(value, "Z8K2")) : undefined
    };
  }

  if (ztype === "Z14") {
    const target = refZid(getField(value, "Z14K1"));
    const composition = getField(value, "Z14K2");
    const code = getField(value, "Z14K3");
    const builtin = getField(value, "Z14K4");
    const calls = composition ? collectCompositionCalls(composition) : { calls: [], dynamicCalls: [] };
    return {
      ...base,
      kind: "implementation",
      target,
      bodyKind: composition ? "composition" : code ? "code" : builtin ? "builtin" : "unknown",
      compositionCalls: calls.calls,
      dynamicCalls: calls.dynamicCalls,
      codeLanguage: code ? refZid(getField(code, "Z16K1")) : undefined,
      codeLength: code ? (stringValue(getField(code, "Z16K2")) ?? "").length : undefined,
      builtinReference: builtin ? refZid(builtin) ?? toCanonicalJson(builtin) : undefined
    };
  }

  return {
    ...base,
    kind: "object"
  };
}

function listRefs(term) {
  const items = zListItems(term) ?? [];
  return items.map(refZid).filter(Boolean);
}

function semanticDependencies(object, { followCompositionCalls }) {
  if (object.kind === "function") {
    return object.implementationZids;
  }
  if (followCompositionCalls && object.kind === "implementation" && object.bodyKind === "composition") {
    return [...new Set(object.compositionCalls.map((call) => call.functionZid))];
  }
  return [];
}

function normalizePrimitiveSet(primitives) {
  if (!primitives) {
    return new Set(defaultVerifiedPrimitives);
  }
  if (primitives instanceof Set) {
    return new Set(primitives);
  }
  return new Set(primitives);
}

function analyzeSeed(corpus, zid, primitives) {
  const object = corpus.get(zid);
  if (!object && primitives.has(zid)) {
    return primitiveResult(zid);
  }
  if (!object) {
    return openResult(zid, "missing_object", [{ zid, reason: "missing_object" }]);
  }
  if (object.kind === "function") {
    const result = resultForFunction(corpus, zid, primitives, emptyContext());
    return result.status ? result : asSeedFunctionResult(zid, result);
  }
  if (object.kind === "implementation") {
    const result = resultForImplementation(corpus, zid, primitives, emptyContext());
    return {
      seed: zid,
      seedKind: "implementation",
      status: result.closed ? "composition_closed" : "open_frontier",
      selectedImplementation: result.selectedImplementation,
      functionsVisited: sorted(result.functionsVisited),
      implementationsVisited: sorted(result.implementationsVisited),
      recursiveCalls: result.recursiveCalls,
      frontier: dedupeFrontier(result.frontier)
    };
  }
  return openResult(zid, "not_function_or_implementation", [{ zid, reason: "not_function_or_implementation", ztype: object.ztype }]);
}

function resultForFunction(corpus, functionZid, primitives, context) {
  if (primitives.has(functionZid)) {
    return {
      seed: functionZid,
      seedKind: "function",
      status: "primitive",
      selectedImplementation: null,
      functionsVisited: sorted(context.functionsVisited.add(functionZid)),
      implementationsVisited: sorted(context.implementationsVisited),
      recursiveCalls: context.recursiveCalls,
      frontier: []
    };
  }

  if (context.functionStack.includes(functionZid)) {
    return {
      closed: true,
      selectedImplementation: null,
      functionsVisited: new Set(context.functionsVisited).add(functionZid),
      implementationsVisited: new Set(context.implementationsVisited),
      recursiveCalls: context.recursiveCalls.concat({ functionZid }),
      frontier: []
    };
  }

  const object = corpus.get(functionZid);
  if (!object) {
    return {
      closed: false,
      selectedImplementation: null,
      functionsVisited: new Set(context.functionsVisited).add(functionZid),
      implementationsVisited: new Set(context.implementationsVisited),
      recursiveCalls: context.recursiveCalls,
      frontier: [{ zid: functionZid, reason: "missing_object" }]
    };
  }
  if (object.kind !== "function") {
    return {
      closed: false,
      selectedImplementation: null,
      functionsVisited: new Set(context.functionsVisited).add(functionZid),
      implementationsVisited: new Set(context.implementationsVisited),
      recursiveCalls: context.recursiveCalls,
      frontier: [{ zid: functionZid, reason: "not_function", ztype: object.ztype }]
    };
  }

  const nextContext = pushFunction(context, functionZid);
  const compositionImplementations = object.implementationZids
    .map((zid) => corpus.get(zid))
    .filter((implementation) => implementation?.kind === "implementation" && implementation.bodyKind === "composition");

  if (compositionImplementations.length === 0) {
    return {
      closed: false,
      selectedImplementation: null,
      functionsVisited: new Set(nextContext.functionsVisited),
      implementationsVisited: new Set(nextContext.implementationsVisited),
      recursiveCalls: nextContext.recursiveCalls,
      frontier: [
        {
          zid: functionZid,
          reason: "no_composition_implementation",
          implementations: object.implementationZids.map((implZid) => summarizeImplementation(corpus.get(implZid), implZid))
        }
      ]
    };
  }

  let best = null;
  for (const implementation of compositionImplementations) {
    const result = resultForImplementation(corpus, implementation.zid, primitives, nextContext);
    if (result.closed) {
      return asSeedFunctionResult(functionZid, result);
    }
    if (!best || result.frontier.length < best.frontier.length) {
      best = result;
    }
  }

  return asSeedFunctionResult(functionZid, best);
}

function resultForImplementation(corpus, implementationZid, primitives, context) {
  if (context.implementationStack.includes(implementationZid)) {
    return {
      closed: true,
      selectedImplementation: implementationZid,
      functionsVisited: new Set(context.functionsVisited),
      implementationsVisited: new Set(context.implementationsVisited).add(implementationZid),
      recursiveCalls: context.recursiveCalls.concat({ implementationZid }),
      frontier: []
    };
  }

  const implementation = corpus.get(implementationZid);
  const nextContext = pushImplementation(context, implementationZid);
  if (!implementation) {
    return {
      closed: false,
      selectedImplementation: implementationZid,
      functionsVisited: new Set(nextContext.functionsVisited),
      implementationsVisited: new Set(nextContext.implementationsVisited),
      recursiveCalls: nextContext.recursiveCalls,
      frontier: [{ zid: implementationZid, reason: "missing_object" }]
    };
  }
  if (implementation.kind !== "implementation") {
    return {
      closed: false,
      selectedImplementation: implementationZid,
      functionsVisited: new Set(nextContext.functionsVisited),
      implementationsVisited: new Set(nextContext.implementationsVisited),
      recursiveCalls: nextContext.recursiveCalls,
      frontier: [{ zid: implementationZid, reason: "not_implementation", ztype: implementation.ztype }]
    };
  }
  if (implementation.bodyKind !== "composition") {
    return {
      closed: false,
      selectedImplementation: implementationZid,
      functionsVisited: new Set(nextContext.functionsVisited),
      implementationsVisited: new Set(nextContext.implementationsVisited),
      recursiveCalls: nextContext.recursiveCalls,
      frontier: [{ zid: implementationZid, reason: `implementation_${implementation.bodyKind}`, target: implementation.target }]
    };
  }

  const combined = {
    closed: true,
    selectedImplementation: implementationZid,
    functionsVisited: new Set(nextContext.functionsVisited),
    implementationsVisited: new Set(nextContext.implementationsVisited),
    recursiveCalls: nextContext.recursiveCalls,
    frontier: []
  };

  for (const dynamicCall of implementation.dynamicCalls) {
    combined.closed = false;
    combined.frontier.push({ zid: implementationZid, reason: "dynamic_call", path: dynamicCall.path });
  }

  for (const call of implementation.compositionCalls) {
    const child = resultForFunction(corpus, call.functionZid, primitives, nextContext);
    mergeResult(combined, child);
  }

  combined.frontier = dedupeFrontier(combined.frontier);
  return combined;
}

function summarizeImplementation(implementation, zid) {
  if (!implementation) {
    return { zid, bodyKind: "missing" };
  }
  return {
    zid,
    bodyKind: implementation.bodyKind,
    target: implementation.target,
    codeLanguage: implementation.codeLanguage,
    builtinReference: implementation.builtinReference
  };
}

function asSeedFunctionResult(functionZid, result) {
  return {
    seed: functionZid,
    seedKind: "function",
    status: result.closed ? "composition_closed" : "open_frontier",
    selectedImplementation: result.selectedImplementation,
    functionsVisited: sorted(result.functionsVisited),
    implementationsVisited: sorted(result.implementationsVisited),
    recursiveCalls: result.recursiveCalls,
    frontier: dedupeFrontier(result.frontier)
  };
}

function primitiveResult(zid) {
  return {
    seed: zid,
    seedKind: "function",
    status: "primitive",
    selectedImplementation: null,
    functionsVisited: [zid],
    implementationsVisited: [],
    recursiveCalls: [],
    frontier: []
  };
}

function openResult(zid, reason, frontier) {
  return {
    seed: zid,
    seedKind: "unknown",
    status: "open_frontier",
    selectedImplementation: null,
    functionsVisited: [zid],
    implementationsVisited: [],
    recursiveCalls: [],
    frontier
  };
}

function emptyContext() {
  return {
    functionStack: [],
    implementationStack: [],
    functionsVisited: new Set(),
    implementationsVisited: new Set(),
    recursiveCalls: []
  };
}

function pushFunction(context, zid) {
  return {
    ...context,
    functionStack: context.functionStack.concat(zid),
    functionsVisited: new Set(context.functionsVisited).add(zid),
    implementationsVisited: new Set(context.implementationsVisited),
    recursiveCalls: context.recursiveCalls
  };
}

function pushImplementation(context, zid) {
  return {
    ...context,
    implementationStack: context.implementationStack.concat(zid),
    functionsVisited: new Set(context.functionsVisited),
    implementationsVisited: new Set(context.implementationsVisited).add(zid),
    recursiveCalls: context.recursiveCalls
  };
}

function mergeResult(target, source) {
  if (source.status === "open_frontier" || source.closed === false) {
    target.closed = false;
  }
  for (const zid of source.functionsVisited ?? []) {
    target.functionsVisited.add(zid);
  }
  for (const zid of source.implementationsVisited ?? []) {
    target.implementationsVisited.add(zid);
  }
  target.recursiveCalls = target.recursiveCalls.concat(source.recursiveCalls ?? []);
  target.frontier = target.frontier.concat(source.frontier ?? []);
}

function dedupeFrontier(frontier) {
  const seen = new Set();
  const out = [];
  for (const item of frontier) {
    const key = `${item.zid}:${item.reason}:${item.path ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => `${a.zid}:${a.reason}`.localeCompare(`${b.zid}:${b.reason}`));
}

function corpusSummary(corpus) {
  const summary = {};
  for (const [zid, object] of [...corpus.objects.entries()].sort()) {
    summary[zid] = {
      kind: object.kind,
      ztype: object.ztype,
      revision: object.revision,
      timestamp: object.timestamp,
      user: object.user,
      ...(object.kind === "function"
        ? {
            implementationZids: object.implementationZids,
            testerZids: object.testerZids
          }
        : {}),
      ...(object.kind === "implementation"
        ? {
            target: object.target,
            bodyKind: object.bodyKind,
            calls: object.compositionCalls.map((call) => call.functionZid),
            codeLanguage: object.codeLanguage,
            builtinReference: object.builtinReference
          }
        : {})
    };
  }
  return summary;
}

function sorted(set) {
  return [...set].sort();
}

export function parsePrimitiveOption(value) {
  if (!value) {
    return new Set(defaultVerifiedPrimitives);
  }
  const primitives = new Set();
  for (const token of value.split(",")) {
    const zid = token.trim();
    if (zid) {
      if (!isZid(zid)) {
        throw new Error(`invalid primitive ZID ${JSON.stringify(zid)}`);
      }
      primitives.add(zid);
    }
  }
  return primitives;
}

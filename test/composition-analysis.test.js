import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSeeds, fetchAnalysisCorpus } from "../src/index.js";
import { err, ok } from "../src/result.js";

const fixtures = {
  Z9000: persistent("Z9000", {
    Z1K1: "Z8",
    Z8K1: ["Z17"],
    Z8K2: "Z40",
    Z8K3: ["Z20"],
    Z8K4: ["Z14", "Z9001"],
    Z8K5: "Z9000"
  }),
  Z9001: persistent("Z9001", {
    Z1K1: "Z14",
    Z14K1: "Z9000",
    Z14K2: {
      Z1K1: "Z7",
      Z7K1: "Z782",
      Z782K1: {
        Z1K1: "Z18",
        Z18K1: "Z9000K1"
      }
    }
  }),
  Z9010: persistent("Z9010", {
    Z1K1: "Z8",
    Z8K1: ["Z17"],
    Z8K2: "Z1",
    Z8K3: ["Z20"],
    Z8K4: ["Z14", "Z9011"],
    Z8K5: "Z9010"
  }),
  Z9011: persistent("Z9011", {
    Z1K1: "Z14",
    Z14K1: "Z9010",
    Z14K2: {
      Z1K1: "Z7",
      Z7K1: "Z38709",
      Z38709K1: ["Z13518"],
      Z38709K2: {
        Z1K1: "Z13518",
        Z13518K1: "1"
      }
    }
  }),
  Z38709: persistent("Z38709", {
    Z1K1: "Z8",
    Z8K1: ["Z17"],
    Z8K2: "Z1",
    Z8K3: ["Z20"],
    Z8K4: ["Z14", "Z38717"],
    Z8K5: "Z38709"
  }),
  Z38717: persistent("Z38717", {
    Z1K1: "Z14",
    Z14K1: "Z38709",
    Z14K3: {
      Z1K1: "Z16",
      Z16K1: "Z610",
      Z16K2: "def Z38709(Z38709K1, Z38709K2):\n    return []\n"
    }
  })
};

test("composition-closed analysis accepts transitive calls only through primitives and Z14K2", async () => {
  const corpus = await fetchAnalysisCorpus(["Z9000"], { fetcher: fakeFetcher, maxObjects: 20 });
  assert.equal(corpus.ok, true, corpus.ok ? undefined : JSON.stringify(corpus.error));

  const report = analyzeSeeds(corpus.value, ["Z9000"], { primitives: new Set(["Z782"]) });
  assert.equal(report.results[0].status, "composition_closed");
  assert.equal(report.results[0].selectedImplementation, "Z9001");
  assert.deepEqual(report.results[0].frontier, []);
});

test("composition analysis rejects no-op wrappers around Python-only functions", async () => {
  const corpus = await fetchAnalysisCorpus(["Z9010"], {
    fetcher: fakeFetcher,
    followCompositionCalls: true,
    maxObjects: 20
  });
  assert.equal(corpus.ok, true, corpus.ok ? undefined : JSON.stringify(corpus.error));

  const report = analyzeSeeds(corpus.value, ["Z9010"], { primitives: new Set() });
  assert.equal(report.results[0].status, "open_frontier");
  assert.equal(report.results[0].selectedImplementation, "Z9011");
  assert.equal(report.results[0].frontier[0].zid, "Z38709");
  assert.equal(report.results[0].frontier[0].reason, "no_composition_implementation");
  assert.equal(report.results[0].frontier[0].implementations[0].bodyKind, "code");
});

test("analysis maxObjects bounds the fetch batch size", async () => {
  const corpus = await fetchAnalysisCorpus(["Z9000", "Z9010", "Z38709"], {
    fetcher: fakeFetcher,
    maxObjects: 2
  });
  assert.equal(corpus.ok, false);
  assert.equal(corpus.error.code, "analysis_limit");
  assert.equal(corpus.error.details.fetchedObjects, 2);
});

async function fakeFetcher(zids) {
  const values = [];
  for (const zid of zids) {
    const canonical = fixtures[zid];
    if (!canonical) {
      return err("missing_fixture", `missing fixture for ${zid}`);
    }
    values.push({
      zid,
      revision: Number(zid.slice(1)),
      canonical,
      timestamp: "2026-08-13T00:00:00Z",
      user: "fixture"
    });
  }
  return ok(values);
}

function persistent(zid, value) {
  return {
    Z1K1: "Z2",
    Z2K1: {
      Z1K1: "Z6",
      Z6K1: zid
    },
    Z2K2: value
  };
}

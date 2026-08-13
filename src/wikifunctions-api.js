import { parseJsonStrict } from "./canonical-json.js";
import { WikifunctionsCache } from "./cache.js";
import { isZid } from "./ids.js";
import { err, ok } from "./result.js";
import { digestCanonical } from "./world.js";

const DEFAULT_ENDPOINT = "https://www.wikifunctions.org/w/api.php";
const DEFAULT_USER_AGENT = "wikifn-composition-analysis/0.1";

export async function fetchPinnedZObjects(zids, options = {}) {
  const uniqueZids = [...new Set(zids)];
  for (const zid of uniqueZids) {
    if (!isZid(zid)) {
      return err("invalid_zid", `cannot fetch invalid ZID ${JSON.stringify(zid)}`);
    }
  }

  if (options.cache !== false) {
    return fetchPinnedZObjectsCached(uniqueZids, options);
  }

  const revisions = await fetchRevisions(uniqueZids, options);
  if (!revisions.ok) {
    return revisions;
  }
  const revisionByZid = new Map([...revisions.value.entries()].map(([zid, revision]) => [zid, revision.revid]));
  const fetched = await fetchCanonicalObjects(uniqueZids, { ...options, revisionByZid });
  if (!fetched.ok) {
    return fetched;
  }
  const objects = [];
  for (const zid of uniqueZids) {
    const canonical = fetched.value.get(zid);
    if (!canonical) {
      return err("missing_api_object", `wikilambda_fetch did not return ${zid}`);
    }
    const revision = revisions.value.get(zid);
    if (!revision) {
      return err("missing_revision", `query/revisions did not return ${zid}`);
    }
    objects.push({
      zid,
      revision: revision.revid,
      timestamp: revision.timestamp,
      user: revision.user,
      digest: digestCanonical(canonical),
      canonical,
      source: "wikifunctions.org",
      cacheHit: false
    });
  }
  return ok(objects);
}

async function fetchPinnedZObjectsCached(uniqueZids, options) {
  const cache = options.objectCache ?? new WikifunctionsCache(options.cacheDir);
  const mode = options.cacheMode ?? "trust";
  const allowNetwork = mode !== "offline";
  const objects = new Map();
  const missing = [];

  if (mode === "trust" || mode === "offline") {
    for (const zid of uniqueZids) {
      const cached = await cache.getLatest(zid);
      if (cached) {
        objects.set(zid, cached);
      } else {
        missing.push(zid);
      }
    }
  } else if (mode === "refresh") {
    const revisions = await fetchRevisions(uniqueZids, options);
    if (!revisions.ok) {
      return revisions;
    }
    for (const zid of uniqueZids) {
      const revision = revisions.value.get(zid);
      if (!revision) {
        return err("missing_revision", `query/revisions did not return ${zid}`);
      }
      const cached = await cache.getRevision(zid, revision.revid);
      if (cached) {
        objects.set(zid, cached);
      } else {
        missing.push(zid);
      }
    }
  } else {
    return err("invalid_cache_mode", `unknown cache mode ${mode}`);
  }

  if (missing.length > 0 && !allowNetwork) {
    return err("cache_miss", `cache does not contain ${missing.join(", ")}`, ["$"], { missing });
  }

  if (missing.length > 0) {
    if (Number.isSafeInteger(options.networkBudget) && missing.length > options.networkBudget) {
      return err("network_limit", `fetch would require ${missing.length} network objects but budget is ${options.networkBudget}`, ["$"], {
        missing
      });
    }
    const fetched = await fetchPinnedZObjects(missing, { ...options, cache: false });
    if (!fetched.ok) {
      return fetched;
    }
    for (const entry of fetched.value) {
      const cached = await cache.put(entry);
      objects.set(entry.zid, cached);
    }
  }

  return ok(uniqueZids.map((zid) => objects.get(zid)).filter(Boolean));
}

export async function fetchCanonicalObjects(zids, options = {}) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const objects = new Map();

  for (const chunk of chunks(zids, options.chunkSize ?? 50)) {
    const revisionByZid = options.revisionByZid;
    const revisions = revisionByZid ? chunk.map((zid) => revisionByZid.get(zid)) : undefined;
    if (revisions?.some((revision) => revision === undefined)) {
      return err("missing_revision", "revisionByZid did not contain every requested ZID");
    }
    const response = await fetchActionApi(
      endpoint,
      {
        action: "wikilambda_fetch",
        zids: chunk.join("|"),
        ...(revisions ? { revisions: revisions.join("|") } : {}),
        format: "json"
      },
      options
    );
    if (!response.ok) {
      return response;
    }

    for (const zid of chunk) {
      const payload = response.value[zid]?.wikilambda_fetch;
      if (typeof payload !== "string") {
        return err("missing_api_object", `wikilambda_fetch response missing ${zid}`);
      }
      const parsed = parseJsonStrict(payload);
      if (!parsed.ok) {
        return parsed;
      }
      objects.set(zid, parsed.value);
    }
  }

  return ok(objects);
}

export async function fetchRevisions(zids, options = {}) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const revisions = new Map();

  for (const chunk of chunks(zids, options.chunkSize ?? 50)) {
    const response = await fetchActionApi(
      endpoint,
      {
        action: "query",
        prop: "revisions",
        titles: chunk.join("|"),
        rvprop: "ids|timestamp|user",
        format: "json",
        formatversion: "2"
      },
      options
    );
    if (!response.ok) {
      return response;
    }

    const pages = response.value.query?.pages;
    if (!Array.isArray(pages)) {
      return err("invalid_api_response", "query/revisions response did not contain pages");
    }
    for (const page of pages) {
      const revision = page.revisions?.[0];
      if (page.missing || !revision) {
        continue;
      }
      revisions.set(page.title, {
        title: page.title,
        pageid: page.pageid,
        revid: revision.revid,
        timestamp: revision.timestamp,
        user: revision.user
      });
    }
  }

  return ok(revisions);
}

async function fetchActionApi(endpoint, params, options) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": options.userAgent ?? DEFAULT_USER_AGENT
      }
    });
  } catch (error) {
    return err("api_fetch_failed", error.message, ["$"], { url: url.toString() });
  }

  if (!response.ok) {
    return err("api_http_error", `HTTP ${response.status} from Wikifunctions API`, ["$"], { url: url.toString() });
  }

  try {
    const json = await response.json();
    if (json.error) {
      return err("api_error", json.error.info ?? json.error.code, ["$"], { code: json.error.code });
    }
    return ok(json);
  } catch (error) {
    return err("api_json_error", error.message, ["$"], { url: url.toString() });
  }
}

function chunks(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

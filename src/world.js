import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { parseJsonStrict, stableStringify } from "./canonical-json.js";
import { isZid } from "./ids.js";
import { normalizeCanonical } from "./normalize.js";
import { err, ok } from "./result.js";
import { checkStructural, collectMissingReferences } from "./structural.js";
import { getField, refZid, stringValue, typeZid } from "./zterm.js";

export class World {
  constructor({ manifest = {}, objects = new Map(), implementations = new Map() } = {}) {
    this.manifest = manifest;
    this.objects = objects;
    this.implementations = implementations;
  }

  has(zid) {
    return this.objects.has(zid);
  }

  get(zid) {
    return this.objects.get(zid);
  }

  resolvePersistent(zid) {
    const object = this.objects.get(zid);
    if (!object) {
      return err("unbound_reference", `no persistent object for ${zid}`);
    }
    return ok(object.persistent);
  }

  resolveValue(zid) {
    const object = this.objects.get(zid);
    if (!object) {
      return err("unbound_reference", `no value for ${zid}`);
    }
    return ok(object.value);
  }

  compositionImplementations(functionZid) {
    return this.implementations.get(functionZid) ?? [];
  }
}

export async function loadSnapshotFile(path) {
  const text = await readFile(path, "utf8");
  const json = parseJsonStrict(text);
  if (!json.ok) {
    return json;
  }
  return buildWorld(json.value);
}

export function buildWorld(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return err("invalid_snapshot", "snapshot must be a JSON object");
  }
  if (!Array.isArray(snapshot.objects)) {
    return err("invalid_snapshot", "snapshot.objects must be an array");
  }

  const objects = new Map();
  const pending = [];

  for (let index = 0; index < snapshot.objects.length; index += 1) {
    const entry = snapshot.objects[index];
    const entryPath = ["$", "objects", String(index)];
    const parsed = buildObjectVersion(entry, entryPath);
    if (!parsed.ok) {
      return parsed;
    }
    if (objects.has(parsed.value.zid)) {
      return err("duplicate_object", `snapshot contains ${parsed.value.zid} more than once`, entryPath.concat("zid"));
    }
    objects.set(parsed.value.zid, parsed.value);
    pending.push(parsed.value);
  }

  const world = new World({
    manifest: snapshot.manifest ?? {},
    objects,
    implementations: indexCompositionImplementations(pending)
  });

  for (const object of pending) {
    const missing = collectMissingReferences(object.persistent, world);
    if (missing.length > 0) {
      return err("open_world", `${object.zid} has references not bound by the snapshot`, ["$", object.zid], { missing });
    }
  }

  return ok(world);
}

export function digestCanonical(value) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function buildObjectVersion(entry, path = ["$"]) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return err("invalid_snapshot_entry", "snapshot object entries must be objects", path);
  }
  if (!isZid(entry.zid)) {
    return err("invalid_zid", "snapshot entry zid must be a ZID", path.concat("zid"));
  }
  if (!Number.isSafeInteger(entry.revision) || entry.revision < 0) {
    return err("invalid_revision", "snapshot entry revision must be a non-negative safe integer", path.concat("revision"));
  }
  if (!Object.hasOwn(entry, "canonical")) {
    return err("missing_canonical", "snapshot entry must contain canonical ZObject JSON", path.concat("canonical"));
  }

  const normalized = normalizeCanonical(entry.canonical, path.concat("canonical"));
  if (!normalized.ok) {
    return normalized;
  }
  const structural = checkStructural(normalized.value, path.concat("canonical"));
  if (!structural.ok) {
    return structural;
  }
  if (typeZid(normalized.value) !== "Z2") {
    return err("not_persistent", "snapshot entries must normalize to Z2/Persistent object", path.concat("canonical"));
  }

  const persistentZid = stringValue(getField(normalized.value, "Z2K1"));
  if (persistentZid !== entry.zid) {
    return err(
      "persistent_id_mismatch",
      `snapshot zid ${entry.zid} does not match Z2K1 ${JSON.stringify(persistentZid)}`,
      path.concat("canonical", "Z2K1")
    );
  }

  const value = getField(normalized.value, "Z2K2");
  const actualDigest = digestCanonical(entry.canonical);
  if (entry.digest && entry.digest !== actualDigest) {
    return err("digest_mismatch", `snapshot digest for ${entry.zid} does not match canonical payload`, path.concat("digest"), {
      expected: entry.digest,
      actual: actualDigest
    });
  }

  return ok({
    zid: entry.zid,
    revision: entry.revision,
    digest: actualDigest,
    persistent: normalized.value,
    value,
    source: entry.source ?? "snapshot"
  });
}

function indexCompositionImplementations(objectVersions) {
  const implementations = new Map();
  for (const object of objectVersions) {
    const value = object.value;
    if (typeZid(value) !== "Z14" || !getField(value, "Z14K2")) {
      continue;
    }
    const functionZid = refZid(getField(value, "Z14K1"));
    if (!functionZid) {
      continue;
    }
    const existing = implementations.get(functionZid) ?? [];
    existing.push({
      zid: object.zid,
      revision: object.revision,
      implementation: value,
      composition: getField(value, "Z14K2")
    });
    implementations.set(functionZid, existing);
  }
  return implementations;
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseJsonStrict, stableStringify } from "./canonical-json.js";
import { digestCanonical } from "./world.js";

const CACHE_VERSION = 1;
const DEFAULT_CACHE_DIR = "cache/wikifunctions";

export function defaultCacheDir() {
  return DEFAULT_CACHE_DIR;
}

export class WikifunctionsCache {
  constructor(root = DEFAULT_CACHE_DIR) {
    this.root = path.resolve(root);
    this.manifestPath = path.join(this.root, "manifest.json");
    this.manifest = null;
  }

  async getLatest(zid) {
    const manifest = await this.loadManifest();
    const object = manifest.objects[zid];
    if (!object?.latestRevision) {
      return undefined;
    }
    return this.getRevision(zid, object.latestRevision);
  }

  async getRevision(zid, revision) {
    const manifest = await this.loadManifest();
    const object = manifest.objects[zid];
    const revisionKey = String(revision);
    const revisionEntry = object?.revisions?.[revisionKey];
    if (!revisionEntry) {
      return undefined;
    }

    const parsed = await readJsonFile(path.join(this.root, revisionEntry.path));
    if (!parsed) {
      return undefined;
    }
    const digest = digestCanonical(parsed.canonical);
    if (digest !== revisionEntry.digest || digest !== parsed.digest) {
      return undefined;
    }
    return {
      zid,
      revision: Number(revision),
      timestamp: parsed.timestamp,
      user: parsed.user,
      digest,
      canonical: parsed.canonical,
      source: parsed.source ?? "wikifunctions-cache",
      cacheHit: true
    };
  }

  async put(entry) {
    const manifest = await this.loadManifest();
    const revision = String(entry.revision);
    const objectDir = path.join("objects", entry.zid);
    const objectPath = path.join(objectDir, `${revision}.json`);
    const digest = entry.digest ?? digestCanonical(entry.canonical);
    const cachedAt = new Date().toISOString();
    const cached = {
      zid: entry.zid,
      revision: entry.revision,
      timestamp: entry.timestamp,
      user: entry.user,
      digest,
      source: entry.source ?? "wikifunctions.org",
      cachedAt,
      canonical: entry.canonical
    };

    await mkdir(path.join(this.root, objectDir), { recursive: true });
    await writeJsonFile(path.join(this.root, objectPath), cached);

    const current = manifest.objects[entry.zid] ?? { revisions: {} };
    current.latestRevision = Math.max(Number(current.latestRevision ?? 0), entry.revision);
    current.revisions[revision] = {
      revision: entry.revision,
      timestamp: entry.timestamp,
      user: entry.user,
      digest,
      path: objectPath,
      cachedAt
    };
    manifest.objects[entry.zid] = current;
    manifest.updatedAt = cachedAt;
    await this.saveManifest();
    return { ...entry, digest, cacheHit: false };
  }

  async stats() {
    const manifest = await this.loadManifest();
    let revisions = 0;
    for (const object of Object.values(manifest.objects)) {
      revisions += Object.keys(object.revisions ?? {}).length;
    }
    return {
      root: this.root,
      objects: Object.keys(manifest.objects).length,
      revisions,
      updatedAt: manifest.updatedAt
    };
  }

  async loadManifest() {
    if (this.manifest) {
      return this.manifest;
    }
    const parsed = await readJsonFile(this.manifestPath);
    this.manifest = parsed ?? {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      objects: {}
    };
    if (this.manifest.version !== CACHE_VERSION || !this.manifest.objects) {
      throw new Error(`unsupported Wikifunctions cache manifest at ${this.manifestPath}`);
    }
    return this.manifest;
  }

  async saveManifest() {
    await mkdir(this.root, { recursive: true });
    await writeJsonFile(this.manifestPath, this.manifest);
  }
}

async function readJsonFile(file) {
  try {
    const text = await readFile(file, "utf8");
    const parsed = parseJsonStrict(text);
    if (!parsed.ok) {
      return undefined;
    }
    return parsed.value;
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeJsonFile(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${stableStringify(value)}\n`, "utf8");
  await rename(tmp, file);
}

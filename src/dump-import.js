import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { parseJsonStrict } from "./canonical-json.js";
import { isZid } from "./ids.js";
import { err, ok } from "./result.js";
import { WikifunctionsCache } from "./cache.js";

const DEFAULT_BATCH_SIZE = 500;

export async function importMediaWikiXmlDump(file, options = {}) {
  const cache = options.objectCache ?? new WikifunctionsCache(options.cacheDir);
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const limit = options.limit;
  const stats = {
    file,
    pages: 0,
    zobjectPages: 0,
    imported: 0,
    skipped: 0,
    errors: []
  };
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) {
      return;
    }
    await cache.putMany(batch);
    stats.imported += batch.length;
    batch = [];
  };

  const pages = readDumpPages(file);
  for await (const pageXml of pages) {
    stats.pages += 1;
    const entry = parseZObjectPage(pageXml, file);
    if (!entry.ok) {
      if (entry.error.code === "not_zobject_page") {
        stats.skipped += 1;
      } else {
        stats.errors.push(entry.error);
      }
      continue;
    }
    stats.zobjectPages += 1;
    batch.push(entry.value);
    if (batch.length >= batchSize) {
      await flush();
    }
    if (limit !== undefined && stats.imported + batch.length >= limit) {
      break;
    }
  }
  await flush();

  await cache.recordDumpImport({
    kind: "mediawiki-pages-meta-current",
    file: path.basename(file),
    source: options.source ?? "wikimedia-dumps",
    pages: stats.pages,
    zobjectPages: stats.zobjectPages,
    imported: stats.imported,
    skipped: stats.skipped,
    errors: stats.errors.length
  });

  return ok(stats);
}

export async function* readDumpPages(file) {
  const stream = dumpTextStream(file);
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    while (true) {
      const start = buffer.indexOf("<page>");
      if (start < 0) {
        buffer = buffer.slice(Math.max(0, buffer.length - 16));
        break;
      }
      const end = buffer.indexOf("</page>", start);
      if (end < 0) {
        buffer = buffer.slice(start);
        break;
      }
      const page = buffer.slice(start, end + "</page>".length);
      buffer = buffer.slice(end + "</page>".length);
      yield page;
    }
  }
}

function dumpTextStream(file) {
  if (file.endsWith(".bz2")) {
    const child = spawn("bzip2", ["-dc", file], { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.setEncoding("utf8");
    return child.stdout;
  }
  if (file.endsWith(".gz")) {
    const child = spawn("gzip", ["-dc", file], { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.setEncoding("utf8");
    return child.stdout;
  }
  const stream = createReadStream(file, { encoding: "utf8" });
  return stream;
}

export function parseZObjectPage(pageXml, sourceFile = "dump") {
  const title = xmlText(pageXml, "title");
  const ns = xmlText(pageXml, "ns");
  if (!isZid(title) || ns !== "0") {
    return err("not_zobject_page", "page is not a main-namespace ZID");
  }

  const revisionXml = xmlBlock(pageXml, "revision");
  if (!revisionXml) {
    return err("missing_revision", `page ${title} has no revision`);
  }
  const model = xmlText(revisionXml, "model");
  if (model !== "zobject") {
    return err("not_zobject_page", `page ${title} has model ${model}`);
  }

  const revision = Number(xmlText(revisionXml, "id"));
  if (!Number.isSafeInteger(revision)) {
    return err("invalid_revision", `page ${title} has invalid revision`);
  }

  const text = xmlText(revisionXml, "text");
  if (text === undefined) {
    return err("missing_text", `page ${title} revision ${revision} has no text`);
  }
  const canonical = parseJsonStrict(text);
  if (!canonical.ok) {
    return canonical;
  }

  return ok({
    zid: title,
    revision,
    timestamp: xmlText(revisionXml, "timestamp"),
    user: xmlText(revisionXml, "username") ?? xmlText(revisionXml, "ip"),
    mediawikiSha1: textAttribute(revisionXml, "sha1"),
    source: `wikimedia-dump:${path.basename(sourceFile)}`,
    canonical: canonical.value
  });
}

function xmlBlock(xml, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`).exec(xml);
  return match?.[0];
}

function xmlText(xml, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function textAttribute(xml, attr) {
  const textOpen = /<text\b([^>]*)>/.exec(xml);
  if (!textOpen) {
    return undefined;
  }
  const match = new RegExp(`${attr}="([^"]*)"`).exec(textOpen[1]);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, entity) => {
    if (entity === "amp") {
      return "&";
    }
    if (entity === "lt") {
      return "<";
    }
    if (entity === "gt") {
      return ">";
    }
    if (entity === "quot") {
      return "\"";
    }
    if (entity === "apos") {
      return "'";
    }
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return `&${entity};`;
  });
}

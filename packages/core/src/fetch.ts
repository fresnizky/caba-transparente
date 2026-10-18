/**
 * Download and raw archive.
 *
 * Every download is stored in data/raw/<source>/<YYYY-MM-DD>/<file>[.gz] and logged in
 * data/raw/<source>/manifest.jsonl with url, date, sha256 and size. If the content is identical to the last
 * download, it is not stored again.
 *
 * Adapted from Mendoza Transparente (MIT): https://github.com/unllamas/mendoza-transparente
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { RAW_DIR, ROOT } from "./paths.ts";
import { sleep } from "./util.ts";

// Government sites answer 403 without a browser User-Agent.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126 Safari/537.36 caba-transparente/0.1";

/**
 * Hosts that reject connections from cloud servers (GitHub Actions). If PROXY_AR is set
 * (http://user:password@host:port, exiting in Argentina), requests to these hosts go through it; the rest go
 * direct. Empty until a CABA site is found to block the cloud.
 */
export const PROXIED_HOSTS: string[] = [];

const proxyFor = (url: string) =>
  process.env.PROXY_AR && PROXIED_HOSTS.includes(new URL(url).hostname) ? process.env.PROXY_AR : undefined;

// Above this size the file is stored gzipped.
const GZIP_THRESHOLD = 1_000_000;

export interface ManifestEntry {
  filename: string;
  path: string;
  url: string;
  fetched_at: string;
  sha256: string;
  bytes: number;
  gzip: boolean;
}

/** HTTP request with retries and a short pause, so we do not overload the servers. */
export async function get(url: string, init: RequestInit = {}, retries = 3): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);

  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(120_000), proxy: proxyFor(url) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} en ${url}`);
      await sleep(500);
      return resp;
    } catch (err) {
      if (attempt >= retries - 1) throw err;
      await sleep(2 ** attempt * 2000);
    }
  }
}

// Last entry per filename, per source. Loaded once per run instead of re-reading the manifest on every archive().
const manifestCache = new Map<string, Map<string, ManifestEntry>>();

async function latestEntries(source: string): Promise<Map<string, ManifestEntry>> {
  const cached = manifestCache.get(source);
  if (cached) return cached;
  const latest = new Map<string, ManifestEntry>();
  const manifest = join(RAW_DIR, source, "manifest.jsonl");
  if (existsSync(manifest)) {
    for (const line of (await readFile(manifest, "utf8")).split("\n")) {
      if (!line) continue;
      const entry = JSON.parse(line) as ManifestEntry;
      latest.set(entry.filename, entry);
    }
  }
  manifestCache.set(source, latest);
  return latest;
}

/**
 * To decide whether an HTML page changed, only what a person sees is compared: visible text, links (a new
 * document usually shows up as a new link) and images. Scripts, styles, metadata and comments are ignored: that
 * is where security tokens, nonces, tracking ids, cache times and anti-bot code change on every visit. The file
 * is still stored whole, as it arrived.
 */
const VOLATILE_LINK_PARTS = [
  /([?&](?:_wpnonce|nonce|token|_ts|ver|v)=)[^&"']*/gi, // tokens and versions in the URL
];

const isHtml = (filename: string) => /\.html?$/i.test(filename);

/** Content fingerprint to compare versions: for HTML, visible text, links and images; for anything else, sha256. */
export function contentFingerprint(filename: string, bytes: Uint8Array): string {
  if (!isHtml(filename)) return createHash("sha256").update(bytes).digest("hex");
  const withoutCode = new TextDecoder()
    .decode(bytes)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  let links = [...withoutCode.matchAll(/<(?:a\b[^>]*?\bhref|img\b[^>]*?\bsrc)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).join("\n");
  for (const re of VOLATILE_LINK_PARTS) links = links.replace(re, "$1");
  const text = withoutCode
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(`${text}\n${links}`).digest("hex");
}

/** Is the new content the same as the last archived version (ignoring what is volatile)? */
async function isUnchanged(last: ManifestEntry | undefined, filename: string, bytes: Uint8Array, sha256: string): Promise<boolean> {
  if (!last) return false;
  if (last.sha256 === sha256) return true;
  if (!isHtml(filename)) return false;
  const previous = join(ROOT, last.path);
  if (!existsSync(previous)) return false;
  return contentFingerprint(filename, await readRaw(previous)) === contentFingerprint(filename, bytes);
}

/** Stores `content` as a raw file of the source. Returns the path, or null if it did not change. */
export async function archive(
  source: string,
  filename: string,
  content: Uint8Array | string,
  { url }: { url: string },
): Promise<string | null> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const sourceDir = join(RAW_DIR, source);
  const latest = await latestEntries(source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (await isUnchanged(latest.get(filename), filename, bytes, sha256)) return null;

  const now = new Date();
  const dayDir = join(sourceDir, now.toISOString().slice(0, 10));
  await mkdir(dayDir, { recursive: true });
  const compressed = bytes.length > GZIP_THRESHOLD;
  // data/raw is append-only: if a different version was already archived that day, the new one gets the time.
  let path = join(dayDir, filename + (compressed ? ".gz" : ""));
  if (existsSync(path)) {
    const time = now.toISOString().slice(11, 19).replaceAll(":", "");
    const dot = filename.lastIndexOf(".");
    const timed = dot > 0 ? `${filename.slice(0, dot)}.${time}${filename.slice(dot)}` : `${filename}.${time}`;
    path = join(dayDir, timed + (compressed ? ".gz" : ""));
  }
  await writeFile(path, compressed ? gzipSync(bytes) : bytes);

  const entry: ManifestEntry = {
    filename,
    path: relative(ROOT, path),
    url,
    fetched_at: `${now.toISOString().slice(0, 19)}Z`,
    sha256,
    bytes: bytes.length,
    gzip: compressed,
  };
  await appendFile(join(sourceDir, "manifest.jsonl"), `${JSON.stringify(entry)}\n`);
  latest.set(filename, entry);
  return path;
}

/** Downloads `url` and archives it under `source`. */
export async function fetchAndArchive(source: string, url: string, filename: string, init?: RequestInit): Promise<string | null> {
  const resp = await get(url, init);
  return archive(source, filename, new Uint8Array(await resp.arrayBuffer()), { url });
}

/**
 * Returns the bytes of the latest archived version of `filename` and, if there is none yet, downloads it,
 * archives it and pauses. For content that does not change (a closed month's PDF, a past bulletin): avoids
 * asking again for what is already in data/raw.
 */
export async function fetchOrReuse(source: string, url: string, filename: string, init?: RequestInit): Promise<Buffer> {
  const prev = await latestRaw(source, filename);
  if (prev && existsSync(prev)) return readRaw(prev);
  const bytes = new Uint8Array(await (await get(url, init)).arrayBuffer());
  await archive(source, filename, bytes, { url });
  await sleep(1000);
  return Buffer.from(bytes);
}

/** Reads a raw file, gunzipping if needed. */
export async function readRaw(path: string): Promise<Buffer> {
  const data = await readFile(path);
  return path.endsWith(".gz") ? gunzipSync(data) : data;
}

/** Absolute path of the latest archived version of `filename`, or null. */
export async function latestRaw(source: string, filename: string): Promise<string | null> {
  const last = (await latestEntries(source)).get(filename);
  return last ? join(ROOT, last.path) : null;
}

/**
 * Copies on archive.org, so nothing depends on a single place.
 *
 * Every file in data/raw/<source>/manifest.jsonl gets two more copies:
 *   - item:    our raw file, exactly as it is in the repo, uploaded to an archive.org item
 *              (`caba-transparente-<source>-<YYYY-MM>`, one per source and month of download).
 *   - wayback: a Wayback Machine capture of the document at its official URL (Save Page Now).
 *
 * Each copy is logged in data/raw/<source>/archive-org.jsonl (append-only) next to the official URL and
 * the manifest's sha256. Process documented in docs/procesos/datos-y-archivo.md.
 *
 * Adapted from Mendoza Transparente (MIT): https://github.com/unllamas/mendoza-transparente
 */

import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ManifestEntry } from "./fetch.ts";
import { RAW_DIR } from "./paths.ts";
import { sleep } from "./util.ts";

export const ITEM_PREFIX = "caba-transparente";
export const ARCHIVE_ORG_FILE = "archive-org.jsonl";

export interface ArchiveOrgRecord {
  /** Path of the file in the repo (same as in manifest.jsonl). */
  path: string;
  /** Official URL it was downloaded from. */
  url: string;
  sha256: string;
  kind: "item" | "wayback";
  /** Link to the copy on archive.org, or null when it failed. */
  archive_url: string | null;
  archived_at: string;
  /** Why there is no copy (archive.org error code). */
  error?: string;
}

/** archive.org credentials (https://archive.org/account/s3.php), or null when not configured. */
export function archiveOrgAuth(): string | null {
  const { IA_ACCESS_KEY: access, IA_SECRET_KEY: secret } = process.env;
  return access && secret ? `LOW ${access}:${secret}` : null;
}

export const itemIdentifier = (source: string, fetchedAt: string) => `${ITEM_PREFIX}-${source}-${fetchedAt.slice(0, 7)}`;

/** archive.org page listing every item of a source. */
export const itemSearchUrl = (source: string) =>
  `https://archive.org/search?query=${encodeURIComponent(`identifier:${ITEM_PREFIX}-${source}-*`)}`;

/** Only URLs that open with a plain GET can be captured by the Wayback Machine. */
export const isCapturableUrl = (url: string) => /^https?:\/\/\S+$/.test(url);

export const archiveTimestamp = () => `${new Date().toISOString().slice(0, 19)}Z`;

async function readJsonl<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export const readManifest = (source: string) => readJsonl<ManifestEntry>(join(RAW_DIR, source, "manifest.jsonl"));
export const readArchiveOrgRecords = (source: string) => readJsonl<ArchiveOrgRecord>(join(RAW_DIR, source, ARCHIVE_ORG_FILE));

export async function appendArchiveOrgRecord(source: string, record: ArchiveOrgRecord): Promise<void> {
  await appendFile(join(RAW_DIR, source, ARCHIVE_ORG_FILE), `${JSON.stringify(record)}\n`);
}

/** Item metadata as archive.org S3 headers (UTF-8 wrapped in `uri()`). */
function itemMetadataHeaders(meta: Record<string, string | string[]>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((v, i) => {
      const name = values.length > 1 ? `x-archive-meta${String(i + 1).padStart(2, "0")}-${key}` : `x-archive-meta-${key}`;
      headers[name] = `uri(${encodeURIComponent(v)})`;
    });
  }
  return headers;
}

/** Uploads a file to an archive.org item, creating the item with `meta` if needed. Returns the download link. */
export async function uploadToItem(
  auth: string,
  identifier: string,
  name: string,
  body: Uint8Array,
  meta: Record<string, string | string[]>,
): Promise<string> {
  const target = `${identifier}/${name.split("/").map(encodeURIComponent).join("/")}`;
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(`https://s3.us.archive.org/${target}`, {
      method: "PUT",
      body,
      headers: {
        authorization: auth,
        "x-amz-auto-make-bucket": "1",
        "x-archive-queue-derive": "0",
        "x-archive-keep-old-version": "1",
        ...itemMetadataHeaders(meta),
      },
      signal: AbortSignal.timeout(600_000),
    });
    if (resp.ok) return `https://archive.org/download/${target}`;
    // 503 SlowDown means archive.org wants us to wait.
    if (attempt >= 4 || resp.status < 500) {
      throw new Error(`archive.org respondió ${resp.status} al subir ${target}: ${(await resp.text()).slice(0, 300)}`);
    }
    await sleep(60_000 * (attempt + 1));
  }
}

interface SaveStatus {
  status?: "success" | "pending" | "error";
  timestamp?: string;
  original_url?: string;
  status_ext?: string;
}

/**
 * Asks the Wayback Machine to capture `url` (unless it has a capture from the last 30 days, which it
 * returns instead) and waits for the result.
 */
export async function savePageNow(auth: string, url: string): Promise<{ archiveUrl: string } | { error: string }> {
  const headers = { authorization: auth, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams({ url, if_not_archived_within: "30d", skip_first_archive: "1" });
  const resp = await fetch("https://web.archive.org/save", { method: "POST", headers, body, signal: AbortSignal.timeout(120_000) });
  if (resp.status === 429) return { error: "error:too-many-requests" };
  const job = (await resp.json().catch(() => ({}))) as { job_id?: string; status_ext?: string };
  if (!job.job_id) return { error: job.status_ext ?? `http-${resp.status}` };

  // A capture takes at most 2 minutes.
  for (let i = 0; i < 30; i++) {
    await sleep(6000);
    const check = await fetch(`https://web.archive.org/save/status/${job.job_id}`, { headers, signal: AbortSignal.timeout(60_000) });
    const s = (await check.json().catch(() => ({}))) as SaveStatus;
    if (s.status === "success" && s.timestamp) return { archiveUrl: `https://web.archive.org/web/${s.timestamp}/${s.original_url ?? url}` };
    if (s.status === "error") return { error: s.status_ext ?? "error" };
  }
  return { error: "error:status-timeout" };
}

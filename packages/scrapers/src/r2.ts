/**
 * Copies the originals and the processed data to Cloudflare R2 (D-05), public at archivo.caba-transparente.com.ar:
 *   bun run subir-r2 [fuentes...] [--solo-raw | --solo-procesados] [--simular]
 *
 * - data/raw/<source>/: every file in manifest.jsonl, under the same path, plus the manifests. A raw path never
 *   changes content, so a file already in R2 with the same size is skipped. Sources in RAW_EXCLUDED are skipped.
 * - data/processed/<source>/: every file, replaced when its content changed. Compared by MD5, which is the ETag
 *   R2 gives an upload sent in a single request (an upload in parts gets another ETag).
 * Nothing is deleted from R2: what is there and no longer here is only listed. Running it twice uploads nothing.
 *
 * Needs the keys in .env.r2 (docs/procesos/datos-y-archivo.md).
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { PROCESSED_DIR, RAW_DIR, ROOT, readManifest } from "@ct/core";

import { RAW_EXCLUDED } from "./raw-excluded.ts";

const ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export interface RemoteObject {
  size: number;
  etag: string;
}

export interface LocalFile {
  key: string;
  path: string;
  size: number;
  /** Only for files that may be replaced: they are read whole and compared by content, not by size. */
  md5?: string;
  bytes?: Uint8Array;
}

/** Whether the object in R2 already has the local content. */
export function isUpToDate(local: LocalFile, remote: RemoteObject | undefined): boolean {
  if (!remote) return false;
  if (local.md5) return remote.etag.replaceAll('"', "") === local.md5;
  return remote.size === local.size;
}

function client(): Bun.S3Client {
  const missing = ENV.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Faltan ${missing.join(", ")}: ver .env.r2 en docs/procesos/datos-y-archivo.md`);
  return new Bun.S3Client({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  });
}

async function remoteObjects(s3: Bun.S3Client, prefix: string): Promise<Map<string, RemoteObject>> {
  const objects = new Map<string, RemoteObject>();
  let continuationToken: string | undefined;
  do {
    const page = await s3.list({ prefix, continuationToken });
    for (const o of page.contents ?? []) objects.set(o.key, { size: o.size ?? 0, etag: o.eTag ?? "" });
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

/** Files under `dir`, recursively, skipping hidden ones (unfinished downloads). */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((rel) => !rel.split("/").some((part) => part.startsWith(".")))
    .map((rel) => join(dir, rel))
    .filter((path) => statSync(path).isFile())
    .sort();
}

const keyOf = (path: string) => relative(ROOT, path);

const contentType = (path: string) =>
  path.endsWith(".jsonl") ? "text/plain;charset=utf-8" : path.endsWith(".csv") ? "text/csv;charset=utf-8" : Bun.file(path).type;

async function withMd5(path: string): Promise<LocalFile> {
  const bytes = await Bun.file(path).bytes();
  return { key: keyOf(path), path, size: bytes.length, md5: createHash("md5").update(bytes).digest("hex"), bytes };
}

/** Raw files of a source that are in data/raw (the local copy may lack old versions), plus its manifests. */
async function rawFiles(source: string): Promise<{ files: LocalFile[]; absent: number }> {
  const files: LocalFile[] = [];
  let absent = 0;
  for (const entry of await readManifest(source)) {
    const path = join(ROOT, entry.path);
    if (existsSync(path)) files.push({ key: entry.path, path, size: statSync(path).size });
    else absent++;
  }
  for (const name of ["manifest.jsonl", "archive-org.jsonl"]) {
    const path = join(RAW_DIR, source, name);
    if (existsSync(path)) files.push(await withMd5(path));
  }
  return { files, absent };
}

async function sync(s3: Bun.S3Client, prefix: string, files: LocalFile[], dryRun: boolean): Promise<void> {
  const remote = await remoteObjects(s3, prefix);
  let uploaded = 0;
  let bytes = 0;
  for (const file of files) {
    if (isUpToDate(file, remote.get(file.key))) continue;
    if (!dryRun) {
      // Small files go in one request so their ETag is their MD5; raw files are streamed in parts.
      await s3.write(file.key, file.bytes ?? Bun.file(file.path), { type: contentType(file.path) });
    }
    console.log(`  ${dryRun ? "subiría" : "subido"} ${file.key}`);
    uploaded++;
    bytes += file.size;
  }
  const keys = new Set(files.map((f) => f.key));
  const extra = [...remote.keys()].filter((key) => !keys.has(key));
  console.log(
    `  ${prefix}: ${uploaded} ${dryRun ? "por subir" : "subidos"} (${(bytes / 1e6).toFixed(1)} MB), ${files.length - uploaded} al día`,
  );
  if (extra.length) console.log(`  en R2 y no acá (no se borran): ${extra.join(", ")}`);
}

const sourcesIn = (dir: string, requested: string[]) =>
  existsSync(dir)
    ? readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory() && (!requested.length || requested.includes(d)))
    : [];

export async function run(args: string[]): Promise<void> {
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const requested = args.filter((a) => !a.startsWith("--"));
  const dryRun = flags.has("--simular");
  const s3 = client();

  if (!flags.has("--solo-procesados")) {
    for (const source of sourcesIn(RAW_DIR, requested).filter((d) => existsSync(join(RAW_DIR, d, "manifest.jsonl")))) {
      console.log(`raw/${source}`);
      if (RAW_EXCLUDED[source]) {
        console.log(`  no se sube a R2: ${RAW_EXCLUDED[source]}`);
        continue;
      }
      const { files, absent } = await rawFiles(source);
      if (absent)
        console.log(`  ${absent} archivos del manifest no están en data/raw local: si faltan en R2, no se pueden subir desde acá`);
      await sync(s3, `data/raw/${source}/`, files, dryRun);
    }
  }

  if (!flags.has("--solo-raw")) {
    for (const source of sourcesIn(PROCESSED_DIR, requested)) {
      console.log(`processed/${source}`);
      const files: LocalFile[] = [];
      for (const path of filesUnder(join(PROCESSED_DIR, source))) files.push(await withMd5(path));
      await sync(s3, `data/processed/${source}/`, files, dryRun);
    }
  }
}

if (import.meta.main) await run(process.argv.slice(2));

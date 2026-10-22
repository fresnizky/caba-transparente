/**
 * Where each source's data lives. The processed data is not in git (D-04, D-05), so a checkout may have only some
 * sources: CT_DATA_DIR lists data folders separated by ":" (like PATH), and each source is read from the first one
 * that has it. The data/ of this checkout always comes last.
 *   CT_DATA_DIR=~/projects/caba-transparente/data bun run dev
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "@ct/core";

export interface DataDirs {
  /** data/processed/<id> of the first folder that has it. */
  processed: (id: string) => string;
  /** data/raw/<id> of the first folder that has its manifest. */
  raw: (id: string) => string;
}

export function dataDirs(env = process.env.CT_DATA_DIR ?? ""): DataDirs {
  const home = process.env.HOME ?? "~";
  const dirs = [
    ...env
      .split(":")
      .filter(Boolean)
      .map((d) => d.replace(/^~/, home)),
    join(ROOT, "data"),
  ];
  const first = (path: (dir: string) => string, marker: (dir: string) => string) =>
    path(dirs.find((d) => existsSync(marker(d))) ?? dirs.at(-1)!);
  return {
    processed: (id) =>
      first(
        (d) => join(d, "processed", id),
        (d) => join(d, "processed", id),
      ),
    raw: (id) =>
      first(
        (d) => join(d, "raw", id),
        (d) => join(d, "raw", id, "manifest.jsonl"),
      ),
  };
}

import { describe, expect, test } from "bun:test";

import { isUpToDate } from "./r2.ts";

describe("isUpToDate", () => {
  const raw = { key: "data/raw/x/2026-10-20/a.csv.gz", path: "/tmp/a.csv.gz", size: 100 };
  const processed = { ...raw, key: "data/processed/x/a.csv", md5: "8347cae7e4a618ef2d802f6a18264567" };

  test("a file missing in R2 is uploaded", () => {
    expect(isUpToDate(raw, undefined)).toBe(false);
  });

  test("raw files are compared by size: their path never changes content", () => {
    expect(isUpToDate(raw, { size: 100, etag: '"a2fb35143f48efb6b90423bb6a1464d1-3"' })).toBe(true);
    expect(isUpToDate(raw, { size: 99, etag: "" })).toBe(false);
  });

  test("processed files are compared by MD5, even with the same size", () => {
    expect(isUpToDate(processed, { size: 100, etag: '"8347cae7e4a618ef2d802f6a18264567"' })).toBe(true);
    expect(isUpToDate(processed, { size: 100, etag: '"00000000000000000000000000000000"' })).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";

import { contentFingerprint } from "./fetch.ts";

const html = (body: string) =>
  new TextEncoder().encode(`<html><head><script>var t=${Math.random()}</script></head><body>${body}</body></html>`);

describe("contentFingerprint", () => {
  test("ignores scripts, comments and volatile link tokens in HTML", () => {
    const a = html('<p>Boletín 7475</p><a href="/norma.pdf?_wpnonce=abc">PDF</a><!-- 10:01 -->');
    const b = html('<p>Boletín 7475</p><a href="/norma.pdf?_wpnonce=xyz">PDF</a><!-- 10:02 -->');
    expect(contentFingerprint("index.html", a)).toBe(contentFingerprint("index.html", b));
  });

  test("detects a new link in HTML", () => {
    const a = html('<a href="/a.pdf">A</a>');
    const b = html('<a href="/a.pdf">A</a><a href="/b.pdf">B</a>');
    expect(contentFingerprint("index.html", a)).not.toBe(contentFingerprint("index.html", b));
  });

  test("compares every byte of non-HTML files", () => {
    const a = new TextEncoder().encode("a,b\n1,2\n");
    const b = new TextEncoder().encode("a,b\n1,3\n");
    expect(contentFingerprint("data.csv", a)).not.toBe(contentFingerprint("data.csv", b));
  });
});

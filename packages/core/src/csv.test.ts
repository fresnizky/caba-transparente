import { describe, expect, test } from "bun:test";

import { parseCsv, toCsv } from "./csv.ts";
import { normalizeCuit, personKind } from "./util.ts";

describe("csv", () => {
  test("round-trips quotes, commas and newlines", () => {
    const rows = [{ nombre: 'Escuela "Jorge Donn", DE 10', nota: "línea 1\nlínea 2", monto: 1234.5 }];
    const [header, row] = parseCsv(toCsv(rows));
    expect(header).toEqual(["nombre", "nota", "monto"]);
    expect(row).toEqual(['Escuela "Jorge Donn", DE 10', "línea 1\nlínea 2", "1234.5"]);
  });
});

describe("cuit", () => {
  test("normalizes both formats published by BAC", () => {
    expect(normalizeCuit("30-54168237-2")).toBe("30541682372");
    expect(normalizeCuit("27035690218")).toBe("27035690218");
    expect(normalizeCuit("CABA-UE-10002")).toBeNull();
  });

  test("tells legal entities from individuals", () => {
    expect(personKind("30541682372")).toBe("juridica");
    expect(personKind("27035690218")).toBe("humana");
  });
});

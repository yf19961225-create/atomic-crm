import { expect, it } from "vitest";
import {
  normalizeBarcode,
  validateBarcode,
  previewBarcodePaste,
} from "./barcode";
it("accepts customer EAN13, preserves leading zero and normalizes empty text", () => {
  expect(normalizeBarcode(" 0123456789012 ")).toBe("0123456789012");
  expect(normalizeBarcode("  ")).toBeNull();
  expect(validateBarcode("0123456789012")).toEqual({ ok: true });
  expect(validateBarcode("")).toEqual({ ok: true });
  expect(validateBarcode("4006381333931")).toEqual({ ok: true });
});
it("rejects malformed or wrong check digits without changing input and proposes the correct digit", () => {
  expect(validateBarcode("1234567890129")).toMatchObject({
    ok: false,
    suggestion: "1234567890128",
  });
  expect(validateBarcode("1e12")).toMatchObject({ ok: false });
  expect(validateBarcode("123456789012")).toMatchObject({ ok: false });
});
it("previews batch mapping, blanks, invalid numbers, duplicate barcodes and ambiguous SKUs", () => {
  const rows = previewBarcodePaste(
    "SKU\tBarcode\nSUN5\t0123456789012\nG03\t\nmissing\t4006381333931\nG15\t1234567890129",
    [
      { id: "1", sku: "SUN5" },
      { id: "2", sku: "G03" },
      { id: "3", sku: "G15" },
    ],
  );
  expect(rows.map((r) => r.id)).toEqual(["1", "2", undefined, "3"]);
  expect(rows[1].barcode).toBeNull();
  expect(rows[2].error).toMatch(/未找到/);
  expect(rows[3].error).toMatch(/校验/);
  expect(
    previewBarcodePaste("A\t0123456789012\nB\t0123456789012", [
      { id: "1", sku: "A" },
      { id: "2", sku: "B" },
    ]).every((r) => !!r.error),
  ).toBe(true);
  expect(
    previewBarcodePaste("A\t0123456789012", [
      { id: "1", sku: "A" },
      { id: "2", sku: "A" },
    ])[0].error,
  ).toMatch(/多行/);
});

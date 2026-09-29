import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  convertSignedXlsx,
  validatePreviewStorageUrl,
} from "../../services/order-pdf-poc/src/convert.mjs";

const previewOrigin = "https://ciwaibtotispazfviims.supabase.co";
const signedUrl =
  "https://ciwaibtotispazfviims.supabase.co/storage/v1/object/sign/order-pdf-poc/order.xlsx?token=short";
const xlsxBytes = Buffer.from("PK\u0003\u0004order-xlsx");

describe("validatePreviewStorageUrl", () => {
  it("rejects a signed URL outside Preview Storage", () => {
    expect(() =>
      validatePreviewStorageUrl(
        "https://evil.example/object.xlsx",
        previewOrigin,
      ),
    ).toThrow(/Preview Storage origin/);
  });
});

describe("convertSignedXlsx", () => {
  it("does not start LibreOffice when Preview Storage redirects the XLSX request", async () => {
    const runner = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { location: "https://evil.example/object.xlsx" },
      }),
    );

    await expect(
      convertSignedXlsx({
        sourceUrl: signedUrl,
        previewStorageOrigin: previewOrigin,
        fetchImpl,
        runSoffice: runner,
      }),
    ).rejects.toThrow(/download failed/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("removes its whole temporary job directory after a successful conversion", async () => {
    const root = await mkdtemp(join(tmpdir(), "order-pdf-poc-test-"));
    let capturedJobDir = "";
    const result = await convertSignedXlsx({
      sourceUrl: signedUrl,
      previewStorageOrigin: previewOrigin,
      jobRoot: root,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(xlsxBytes, {
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        }),
      ),
      runSoffice: async ({ inputPath, outputDir, jobDir }) => {
        capturedJobDir = jobDir;
        expect(await readFile(inputPath)).toEqual(xlsxBytes);
        await writeFile(join(outputDir, "order.pdf"), "%PDF-1.7 preview");
        return join(outputDir, "order.pdf");
      },
    });

    expect(result.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(readFile(capturedJobDir)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

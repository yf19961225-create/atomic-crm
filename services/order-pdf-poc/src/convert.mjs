import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEFAULT_MAX_XLSX_BYTES = 20 * 1024 * 1024;

export function validatePreviewStorageUrl(sourceUrl, previewStorageOrigin) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.origin !== previewStorageOrigin) {
    throw new Error(
      "XLSX source must use the configured Preview Storage origin",
    );
  }
  return url;
}

function isXlsx(bytes) {
  return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

function defaultRunSoffice({ inputPath, outputDir, jobDir }) {
  return new Promise((resolve, reject) => {
    const profile = "-env:UserInstallation=file://" + join(jobDir, "profile");
    const process = spawn(
      "soffice",
      [
        "--headless",
        profile,
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        inputPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    process.once("error", reject);
    process.once("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            "LibreOffice conversion failed (" +
              code +
              "): " +
              stderr.slice(0, 300),
          ),
        );
        return;
      }
      resolve(join(outputDir, basename(inputPath, ".xlsx") + ".pdf"));
    });
  });
}

/**
 * Converts only final signed XLSX bytes. It deliberately has no Order or
 * database dependency and always removes its local job directory.
 */
export async function convertSignedXlsx({
  sourceUrl,
  previewStorageOrigin,
  fetchImpl = fetch,
  runSoffice = defaultRunSoffice,
  jobRoot = tmpdir(),
  maxXlsxBytes = DEFAULT_MAX_XLSX_BYTES,
}) {
  validatePreviewStorageUrl(sourceUrl, previewStorageOrigin);
  const response = await fetchImpl(sourceUrl, { redirect: "error" });
  if (!response.ok) {
    throw new Error("XLSX download failed (" + response.status + ")");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes(XLSX_CONTENT_TYPE)) {
    throw new Error("XLSX download has an unexpected content type");
  }
  const xlsx = Buffer.from(await response.arrayBuffer());
  if (xlsx.byteLength > maxXlsxBytes || !isXlsx(xlsx)) {
    throw new Error("XLSX download is invalid or exceeds the configured limit");
  }

  const jobDir = await mkdtemp(
    join(jobRoot, "order-pdf-" + randomUUID() + "-"),
  );
  try {
    const outputDir = join(jobDir, "out");
    const inputPath = join(jobDir, "input.xlsx");
    await mkdir(outputDir);
    await writeFile(inputPath, xlsx);
    const pdfPath = await runSoffice({ inputPath, outputDir, jobDir });
    const pdf = await readFile(pdfPath);
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("LibreOffice did not produce a valid PDF");
    }
    return { pdf };
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}

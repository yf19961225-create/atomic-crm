export type LibreOfficeJob = {
  inputPath: string;
  outputDir: string;
  jobDir: string;
};

export type ConvertSignedXlsxOptions = {
  sourceUrl: string;
  previewStorageOrigin: string;
  fetchImpl?: typeof fetch;
  runSoffice?: (job: LibreOfficeJob) => Promise<string>;
  jobRoot?: string;
  maxXlsxBytes?: number;
};

export function validatePreviewStorageUrl(
  sourceUrl: string,
  previewStorageOrigin: string,
): URL;

export function convertSignedXlsx(
  options: ConvertSignedXlsxOptions,
): Promise<{ pdf: Buffer }>;

/**
 * Reserved boundary for a future implementation. It must accept only the
 * frozen XLSX bytes produced by `renderOrderXlsx`, then return PDF bytes.
 * No PDF renderer may re-read Order, Product Library, Sanity, or Customer data.
 */
export type OrderXlsxToPdfConverter = (
  finalXlsx: ArrayBuffer,
) => Promise<ArrayBuffer>;

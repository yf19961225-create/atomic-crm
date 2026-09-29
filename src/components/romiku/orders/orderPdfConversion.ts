const ORDER_PDF_ENDPOINT = "/api/order-pdf/forms/libreoffice/convert";

/**
 * Sends only final XLSX bytes to the same-origin Preview LibreOffice service.
 * The service has no Order identifier or business-data dependency.
 */
export async function convertOrderXlsxToPdf(
  xlsx: ArrayBuffer,
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const form = new FormData();
  form.append(
    "files",
    new File([xlsx], "ORDER.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const response = await fetchImpl(ORDER_PDF_ENDPOINT, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/pdf")
  )
    throw new Error("Order PDF conversion unavailable");
  const pdf = await response.arrayBuffer();
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-")
    throw new Error("Order PDF conversion returned invalid output");
  return pdf;
}

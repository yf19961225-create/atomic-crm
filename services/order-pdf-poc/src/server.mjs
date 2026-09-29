import { createServer } from "node:http";

import { isAuthorized } from "./auth.mjs";
import { convertSignedXlsx } from "./convert.mjs";

const token = process.env.ORDER_PDF_POC_TOKEN;
const previewStorageOrigin = process.env.PREVIEW_STORAGE_ORIGIN;

if (!token || !previewStorageOrigin) {
  throw new Error(
    "ORDER_PDF_POC_TOKEN and PREVIEW_STORAGE_ORIGIN are required",
  );
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/convert") {
    response.writeHead(404).end();
    return;
  }
  if (!isAuthorized(request.headers.authorization, token)) {
    response.writeHead(401).end();
    return;
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) {
      response.writeHead(413).end();
      return;
    }
  }
  try {
    const { sourceUrl } = JSON.parse(body);
    const { pdf } = await convertSignedXlsx({
      sourceUrl,
      previewStorageOrigin,
    });
    response.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="ORDER.pdf"',
      "content-length": pdf.byteLength,
    });
    response.end(pdf);
  } catch (error) {
    // Deliberately avoid logging source URLs or document-derived content.
    console.error(
      "order-pdf-poc conversion failed",
      error instanceof Error ? error.message : "unknown",
    );
    response.writeHead(422).end();
  }
});

server.listen(Number(process.env.PORT || 8080));

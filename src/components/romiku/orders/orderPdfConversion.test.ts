import { describe, expect, it, vi } from "vitest";

import { convertOrderXlsxToPdf } from "./orderPdfConversion";

describe("convertOrderXlsxToPdf", () => {
  it("posts only final XLSX bytes to the same-origin Preview LibreOffice route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer;

    const pdf = await convertOrderXlsxToPdf(xlsx, fetchMock);

    expect(new Uint8Array(pdf)).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/order-pdf/forms/libreoffice/convert");
    expect(request.method).toBe("POST");
    expect(request.cache).toBe("no-store");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("files")).toBeInstanceOf(File);
  });
});

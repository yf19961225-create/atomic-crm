import { afterEach, expect, it, vi } from "vitest";
import { prepareProductImage } from "./orderXlsxRenderer";
afterEach(() => vi.restoreAllMocks());
it("reads the configured public product CDN in the browser without changing the server allowlist", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 3;
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(blob));
  const url = "https://res.cloudinary.com/dujtss32z/image/upload/v1/SKU.png";
  const image = await prepareProductImage(url, 9);
  expect(fetcher.mock.calls[0][0]).toBe(url);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  expect(image).toMatchObject({ row: 9, width: 2, height: 3 });
});

it("uses only an exact-SKU website fallback when the saved image cannot be loaded", async () => {
  const { prepareSnapshotProductImage } = await import("./orderXlsxRenderer");
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const blob = await new Promise<Blob>((r) =>
    canvas.toBlob((b) => r(b!), "image/png"),
  );
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/product-images?"))
        return new Response(
          JSON.stringify({
            images: {
              SAME: "https://romiku.com/images/SAME.jpg",
              OTHER: "https://romiku.com/images/OTHER.jpg",
            },
          }),
        );
      if (url.includes("SAME.jpg")) return new Response(blob);
      return new Response("", { status: 404 });
    });
  expect(
    await prepareSnapshotProductImage(
      "https://romiku.com/missing.jpg",
      "SAME",
      9,
    ),
  ).toMatchObject({ row: 9 });
  expect(
    fetcher.mock.calls.every((c) => !String(c[0]).includes("OTHER.jpg")),
  ).toBe(true);
});

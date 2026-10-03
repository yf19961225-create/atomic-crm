import { expect, it, vi } from "vitest";
import {
  uploadMarkingImage,
  hydrateProductionMarkingImages,
} from "./markingAssets";
import { normalizeProductionExportModel } from "../production/productionExportModel";
const { upload, download } = vi.hoisted(() => ({
  upload: vi.fn().mockResolvedValue({ error: null }),
  download: vi.fn(),
}));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "test-user" } },
        error: null,
      }),
    },
    storage: { from: () => ({ upload, download }) },
  }),
}));
const png = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = 20;
  return new File(
    [
      await new Promise<Blob>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!), "image/png"),
      ),
    ],
    "front.png",
    { type: "image/png" },
  );
};
it("uploads each image to a new immutable object and returns only metadata", async () => {
  const a = await uploadMarkingImage(await png()),
    b = await uploadMarkingImage(await png());
  expect(a.path).not.toBe(b.path);
  expect(a.path).toMatch(/^test-user\/[a-f0-9-]+\.png$/);
  expect(a).toMatchObject({
    bucket: "romiku-marking-assets",
    name: "front.png",
    mime_type: "image/png",
  });
  expect(JSON.stringify(a)).not.toContain("base64");
  expect(upload.mock.calls.at(-1)?.[2]).toMatchObject({ upsert: false });
});
it("rejects invalid files and oversized uploads before Storage", async () => {
  await expect(
    uploadMarkingImage(new File(["bad"], "bad.txt", { type: "text/plain" })),
  ).rejects.toThrow(/PNG/);
  await expect(
    uploadMarkingImage(
      new File([new Uint8Array(10485761)], "big.png", { type: "image/png" }),
    ),
  ).rejects.toThrow(/10 MB/);
  await expect(
    uploadMarkingImage(new File(["bad"], "fake.png", { type: "image/png" })),
  ).rejects.toThrow(/图片/);
});
it("resolves saved object paths only, and fails clearly if an image cannot be downloaded", async () => {
  const model = normalizeProductionExportModel(
    {
      marking_snapshot: {
        front_mark: {
          mode: "image",
          image_asset: {
            bucket: "romiku-marking-assets",
            path: "old/front.png",
          },
        },
      },
    },
    [],
  );
  download.mockResolvedValueOnce({ data: await png(), error: null });
  const result = await hydrateProductionMarkingImages(model);
  expect(result.markingImages.front_mark).toMatch(/^data:image\/png;base64,/);
  expect(download).toHaveBeenLastCalledWith("old/front.png");
  download.mockResolvedValueOnce({ data: null, error: new Error("denied") });
  await expect(hydrateProductionMarkingImages(model)).rejects.toThrow(
    /正唛.*图片/,
  );
});

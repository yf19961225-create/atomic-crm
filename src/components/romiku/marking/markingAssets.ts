import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import {
  MARKING_BUCKET,
  markingKeys,
  type MarkingAsset,
  type Mark,
} from "./markingProfile";
import type { ProductionExportModel } from "../production/productionExportModel";
export const markingLabels = {
  front_mark: "正唛",
  side_mark: "侧唛",
  small_label: "小标签",
};
export async function uploadMarkingImage(file: File): Promise<MarkingAsset> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("请选择 PNG、JPEG 或 WebP 图片。");
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("图片大小必须大于零且不超过 10 MB。");
  try {
    const image = await createImageBitmap(file);
    image.close();
  } catch {
    throw new Error("无法读取图片，请选择有效的图片文件。");
  }
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("请先登录后上传图片。");
  const extension =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png";
  const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage
    .from(MARKING_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw new Error("图片上传失败，请重试。");
  return {
    bucket: MARKING_BUCKET,
    path,
    name: file.name,
    mime_type: file.type,
    size: file.size,
  };
}
export async function downloadMarkingImage(asset: MarkingAsset): Promise<Blob> {
  const { data, error } = await getSupabaseClient()
    .storage.from(MARKING_BUCKET)
    .download(asset.path);
  if (error || !data) throw new Error("无法读取已保存的图片，请重试。");
  return data;
}
const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取图片。"));
    reader.readAsDataURL(blob);
  });
/** Resolves only the immutable references already captured in the saved model. */
export async function hydrateProductionMarkingImages(
  model: ProductionExportModel,
): Promise<ProductionExportModel> {
  const downloads = new Map<string, Promise<string>>();
  async function resolve(mark: Mark, label: string) {
    if (mark.mode !== "image") return "";
    if (!mark.image_asset)
      throw new Error(`${label}选择了图片模式，但没有保存图片。`);
    const asset = mark.image_asset,
      key = `${asset.bucket}/${asset.path}`;
    if (!downloads.has(key))
      downloads.set(key, downloadMarkingImage(asset).then(dataUrl));
    try {
      return await downloads.get(key)!;
    } catch {
      throw new Error(`${label}图片读取失败，请检查已保存图片后重试。`);
    }
  }
  const [entries, items] = await Promise.all([
    Promise.all(
      markingKeys.map(
        async (key) =>
          [key, await resolve(model.marking[key], markingLabels[key])] as const,
      ),
    ),
    Promise.all(
      model.items.map(async (item) => ({
        ...item,
        smallLabelImage: await resolve(
          item.smallLabel,
          `产品 ${item.sku} 小标签`,
        ),
      })),
    ),
  ]);
  return { ...model, items, markingImages: Object.fromEntries(entries) };
}

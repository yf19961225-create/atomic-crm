export const MARKING_BUCKET = "romiku-marking-assets";
export type MarkingAsset = {
  bucket: typeof MARKING_BUCKET;
  path: string;
  name: string;
  mime_type: string;
  size: number;
};
export type Mark = {
  mode: "image" | "text" | "none";
  text: string;
  image_asset: MarkingAsset | null;
};
export type MarkingProfile = {
  version: 1;
  front_mark: Mark;
  side_mark: Mark;
  small_label: Mark;
  labeling_requirements: string;
  production_requirements: string;
};
export const markingKeys = ["front_mark", "side_mark", "small_label"] as const;
export const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function markingAsset(value: unknown): MarkingAsset | null {
  const asset = recordValue(value);
  if (
    asset.bucket !== MARKING_BUCKET ||
    typeof asset.path !== "string" ||
    !/^[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$/.test(asset.path) ||
    asset.path.includes("..")
  )
    return null;
  return {
    bucket: MARKING_BUCKET,
    path: asset.path,
    name: text(asset.name),
    mime_type: text(asset.mime_type),
    size: Number(asset.size) || 0,
  };
}
export function normalizeMarkingProfile(value: unknown): MarkingProfile {
  const profile = recordValue(value);
  const mark = (value: unknown): Mark => {
    const data = recordValue(value);
    const image_asset = markingAsset(data.image_asset);
    const content = text(data.text);
    const mode = ["image", "text", "none"].includes(String(data.mode))
      ? (data.mode as Mark["mode"])
      : image_asset
        ? "image"
        : content
          ? "text"
          : "none";
    return { mode, text: content, image_asset };
  };
  return {
    version: 1,
    front_mark: mark(profile.front_mark),
    side_mark: mark(profile.side_mark),
    small_label: mark(profile.small_label),
    labeling_requirements: text(profile.labeling_requirements),
    production_requirements: text(profile.production_requirements),
  };
}
export function customerMarkingProfile(customer: Record<string, unknown>) {
  const saved = recordValue(customer.marking_profile);
  const legacy = recordValue(customer.requirements);
  return normalizeMarkingProfile(
    Object.keys(saved).length
      ? saved
      : {
          front_mark: { text: legacy.shipping_marks },
          small_label: { text: legacy.product_labels },
          production_requirements: legacy.packaging,
        },
  );
}
export function createProductionMarkingSnapshot(
  order: Record<string, unknown>,
  customer?: Record<string, unknown>,
) {
  const profile = customer
    ? customerMarkingProfile(customer)
    : normalizeMarkingProfile(
        order.marking_snapshot ??
          recordValue(order.counterparty_snapshot).marking_snapshot,
      );
  const orderRequirements = [
    order.production_requirements,
    recordValue(order.terms_snapshot).production_requirements,
    order.notes,
  ].filter(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  profile.production_requirements = [
    ...new Set(
      [...orderRequirements, profile.production_requirements].filter(Boolean),
    ),
  ].join("\n");
  return profile;
}

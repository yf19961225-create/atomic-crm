import {
  normalizeMarkingProfile,
  recordValue,
  type MarkingProfile,
  type Mark,
} from "../marking/markingProfile";
import { resolveProductionItemMarking } from "../marking/productionInstructions";
export type ProductionExportModel = {
  document: { number: string };
  marking: MarkingProfile;
  markingImages: Partial<
    Record<"front_mark" | "side_mark" | "small_label", string>
  >;
  items: {
    position: number;
    sku: string;
    imageUrl: string;
    description: string;
    cartons: number;
    qtyPerCarton: number | null;
    quantity: number;
    smallLabel: Mark;
    smallLabelImage: string;
  }[];
  totals: { cartons: number; quantity: number };
  requirements: string;
};
const numeric = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function normalizeProductionExportModel(
  production: Record<string, unknown>,
  savedItems: Record<string, unknown>[],
): ProductionExportModel {
  const marking = normalizeMarkingProfile(production.marking_snapshot);
  const items = [...savedItems]
    .sort(
      (a, b) =>
        numeric(a.position) - numeric(b.position) ||
        String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
        String(a.id || "").localeCompare(String(b.id || "")),
    )
    .map((item, index) => {
      const product = recordValue(item.product_snapshot),
        packing = recordValue(item.packaging_snapshot);
      return {
        position: index + 1,
        sku: text(item.sku),
        imageUrl: text(product.image_url),
        description: [
          text(product.name),
          text(product.specification),
          text(item.production_note_zh),
        ]
          .filter(Boolean)
          .join("\n"),
        cartons: numeric(packing.cartons ?? packing.carton_qty),
        qtyPerCarton:
          packing.qty_per_carton == null || packing.qty_per_carton === ""
            ? null
            : numeric(packing.qty_per_carton),
        quantity: numeric(item.quantity),
        smallLabel: resolveProductionItemMarking(
          production.marking_snapshot,
          item.marking_override,
        ).smallLabel,
        smallLabelImage: "",
      };
    });
  return {
    document: { number: text(production.document_number) },
    marking,
    markingImages: {},
    items,
    totals: items.reduce(
      (sum, item) => ({
        cartons: sum.cartons + item.cartons,
        quantity: sum.quantity + item.quantity,
      }),
      { cartons: 0, quantity: 0 },
    ),
    requirements: marking.production_requirements,
  };
}

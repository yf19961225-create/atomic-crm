import { normalizeBarcode, validateBarcode } from "./barcode";
import type { AllocationIssue } from "./productionAllocation";
import type { RaRecord } from "ra-core";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import {
  normalizeItemMarkingOverride,
  normalizeProductionInstructions,
  resolveProductionItemMarking,
} from "../marking/productionInstructions";
export function productionSuffix(number: unknown, orderNumber: unknown) {
  const full = String(number || "未编号生产单"),
    prefix = `${String(orderNumber)}-`;
  return full.startsWith(prefix) ? full.slice(prefix.length) : full;
}
export const savedBuyerName = (order?: RaRecord) => {
  const s = order?.counterparty_snapshot;
  return String(
    s?.company_name ||
      s?.company ||
      s?.name ||
      s?.business_name ||
      "未填写客户",
  );
};
export function workspaceExpected(record: RaRecord, items: RaRecord[]) {
  return {
    header_updated_at: record.updated_at,
    items: items.map((i) => ({ id: i.id, updated_at: i.updated_at })),
  };
}
export function itemLabelSummary(common: unknown, override: unknown) {
  const result = resolveProductionItemMarking(common, override);
  return result.labels
    .map((l) =>
      l.mode === "image" ? l.image_asset?.name || "图片标签" : l.text,
    )
    .filter(Boolean)
    .join(" + ");
}
export async function saveProductionWorkspace(
  record: RaRecord,
  items: RaRecord[],
  expected: unknown,
  isNew = false,
) {
  const header: Record<string, unknown> = {};
  for (const key of [
    "name",
    "status",
    "factory_due_at",
    "anomaly_notes",
    "notes",
    "marking_snapshot",
  ])
    if (record[key] !== undefined) header[key] = record[key];
  if (!isNew && record.document_number)
    header.document_number = record.document_number;
  for (const item of items) {
    const check = validateBarcode(item.barcode_number);
    if (!check.ok) throw new Error(`${item.sku}：${check.message}`);
  }
  const payload = items.map((i) => ({
    id: i.isNew ? null : i.id,
    source_order_item_id: i.source_order_item_id,
    quantity: Number(i.quantity),
    barcode_number: normalizeBarcode(i.barcode_number),
    product_snapshot: Object.fromEntries(
      ["name", "specification", "image_url"]
        .filter((k) => i.product_snapshot?.[k] !== undefined)
        .map((k) => [k, i.product_snapshot[k]]),
    ),
    packaging_snapshot: Object.fromEntries(
      ["cartons", "qty_per_carton"].map((k) => {
        const value =
          i.packaging_snapshot?.[k] ??
          (k === "cartons" ? i.packaging_snapshot?.carton_qty : null);
        return [k, value == null || value === "" ? null : Number(value)];
      }),
    ),
    production_note_zh: i.production_note_zh || null,
    marking_override: normalizeItemMarkingOverride(i.marking_override),
  }));
  const { data, error } = await getSupabaseClient().rpc(
    "romiku_save_production_workspace",
    {
      production_id: isNew ? null : record.id,
      source_order_id: record.order_id,
      header,
      items: payload,
      expected,
    },
  );
  if (error || !data) throw new Error("保存未完成，请检查连接后重试。");
  return data as {
    ok: boolean;
    id?: string;
    message?: string;
    code?: string;
    dependencies?: AllocationIssue[];
  };
}
export async function syncOrderProductionDefaults(
  orderId: string,
  expected: unknown = null,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "romiku_sync_order_production_defaults",
    { source_order_id: orderId, expected },
  );
  if (error || !data) throw new Error("无法读取或同步生产单，请刷新后重试。");
  if (!data.ok) throw new Error(data.message || "同步未完成。");
  return data as {
    ok: true;
    token?: string;
    productions?: RaRecord[];
    count?: number;
    source_snapshot: unknown;
    order_document_number: string;
  };
}

export const EMPTY_PRODUCTION_DEFAULTS =
  "当前订单尚未设置统一生产要求，请先设置订单的生产要求 / 唛头与标签。";
export function hasProductionInstructions(value: unknown) {
  const p = normalizeProductionInstructions(value);
  return (
    [p.front_mark, p.side_mark, p.small_label, ...p.additional_labels].some(
      (m) =>
        m.mode === "text"
          ? !!m.text.trim()
          : m.mode === "image" && !!m.image_asset,
    ) ||
    [p.labeling_requirements, p.production_requirements, p.notes].some(
      (v) => !!v.trim(),
    )
  );
}
export function sharedInstructionsEqual(left: unknown, right: unknown) {
  const fields = [
    "front_mark",
    "side_mark",
    "small_label",
    "additional_labels",
    "labeling_requirements",
    "production_requirements",
    "notes",
  ] as const;
  const shared = (value: unknown) => {
    const normalized = normalizeProductionInstructions(value);
    return fields.map((key) => normalized[key]);
  };
  return JSON.stringify(shared(left)) === JSON.stringify(shared(right));
}

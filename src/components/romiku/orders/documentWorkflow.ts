import type { DataProvider } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { quoteHeaderWrite } from "../quotes/quoteWorkflow";
import {
  defaultOrderExportSnapshot,
  withOrderExportSnapshot,
} from "./orderExportSnapshot";

export type DocumentKind = "pi" | "order";
export const documentConfig = {
  pi: {
    label: "PI",
    plural: "PI",
    path: "/pi",
    resource: "romiku_pis",
    items: "romiku_pi_items",
    totals: "romiku_pi_totals",
    foreignKey: "pi_id",
    statuses: ["draft", "sent", "confirmed", "cancelled"],
  },
  order: {
    label: "订单",
    plural: "订单",
    path: "/orders",
    resource: "romiku_orders",
    items: "romiku_order_items",
    totals: "romiku_order_totals",
    foreignKey: "order_id",
    statuses: [
      "draft",
      "confirmed",
      "in_production",
      "ready_to_ship",
      "shipped",
      "completed",
      "cancelled",
    ],
  },
};
type ConversionRpc = {
  rpc: (
    name: string,
    args: { source_kind: string; source_id: string; target_kind: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export async function convertDocument(
  client: ConversionRpc,
  source: "quote" | "pi",
  sourceId: string,
  target: DocumentKind,
) {
  if (
    !sourceId ||
    !(
      (source === "quote" && ["pi", "order"].includes(target)) ||
      (source === "pi" && target === "order")
    )
  )
    throw new Error("不支持此单据转换。");
  const { data, error } = await client.rpc("romiku_convert_document", {
    source_kind: source,
    source_id: sourceId,
    target_kind: target,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) throw new Error("转换后未返回单据。");
  return data;
}
export async function createDocument(
  provider: DataProvider,
  kind: DocumentKind,
  buyerName: string,
  customer?: { formalCustomerId: string; snapshot: Values },
) {
  if (!buyerName.trim()) throw new Error("采购方名称为必填项。");
  return provider.create(documentConfig[kind].resource, {
    data: {
      status: "draft",
      currency: "USD",
      document_language: "zh",
      deposit_percent: 30,
      counterparty_snapshot: customer?.snapshot || { name: buyerName.trim() },
      ...(kind === "order"
        ? {
            terms_snapshot: withOrderExportSnapshot(
              {},
              defaultOrderExportSnapshot(),
            ),
          }
        : {}),
      ...(customer ? { formal_customer_id: customer.formalCustomerId } : {}),
    },
  });
}
export function documentHeaderWrite(kind: DocumentKind, values: Values) {
  // Reuse commercial validation; PI validity belongs to its independent terms snapshot.
  const { status, valid_until: _validity, ...commercial } = values;
  const write = quoteHeaderWrite(commercial);
  if (status !== undefined) {
    if (!documentConfig[kind].statuses.includes(String(status)))
      throw new Error("请选择有效的单据状态。");
    write.status = status;
  }
  if (values.deposit_percent !== undefined) {
    const percent = Number(values.deposit_percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      throw new Error("定金比例必须介于 0 到 100 之间。");
    write.deposit_percent = percent;
  }
  const dates = [
    "deposit_due_at",
    "balance_due_at",
    ...(kind === "order" ? ["expected_delivery_at", "actual_delivery_at"] : []),
  ];
  for (const key of dates)
    if (values[key] !== undefined) {
      if (!values[key]) write[key] = null;
      else {
        const date = new Date(String(values[key]));
        if (!Number.isFinite(date.getTime()))
          throw new Error("请输入有效日期。");
        write[key] = date.toISOString();
      }
    }
  if (kind === "order" && values.purchase_order_number !== undefined)
    write.purchase_order_number = values.purchase_order_number;
  return write;
}

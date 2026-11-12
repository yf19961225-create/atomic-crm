import {
  saveDocumentAtomically,
  createDocumentFromSource,
} from "../commercial/atomicDocumentSave";
import { statusOptions } from "../shared/workflowStatus";
import type { DataProvider } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { quoteHeaderWrite } from "../quotes/quoteWorkflow";
import {
  defaultOrderExportSnapshot,
  withOrderExportSnapshot,
} from "./orderExportSnapshot";
import {
  defaultPiBankSnapshot,
  defaultPiExportSnapshot,
  withPiExportSnapshot,
} from "./piExportSnapshot";

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
    statuses: statusOptions("pi").map((o) => o.value),
  },
  order: {
    label: "订单",
    plural: "订单",
    path: "/orders",
    resource: "romiku_orders",
    items: "romiku_order_items",
    totals: "romiku_order_totals",
    foreignKey: "order_id",
    statuses: statusOptions("order")
      .filter(({ value }) => value !== "voided")
      .map(({ value }) => value),
  },
};
export async function convertDocument(
  provider: DataProvider,
  source: "quote" | "pi",
  sourceId: string,
  target: DocumentKind,
  expectedSourceRevision: number,
) {
  if (
    !sourceId ||
    !(
      (source === "quote" && ["pi", "order"].includes(target)) ||
      (source === "pi" && target === "order")
    )
  )
    throw new Error("不支持此单据转换。");
  const result = await createDocumentFromSource(provider, {
    sourceKind: source,
    sourceId,
    targetKind: target,
    expectedSourceRevision,
  });
  return result.document_id;
}
export async function createDocument(
  provider: DataProvider,
  kind: DocumentKind,
  buyerName: string,
  customer?: { formalCustomerId: string; snapshot: Values },
  documentId: string = crypto.randomUUID(),
) {
  if (!buyerName.trim()) throw new Error("采购方名称为必填项。");
  const result = await saveDocumentAtomically(provider, {
    kind,
    documentId,
    expectedRevision: 0,
    items: [],
    header: {
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
      ...(kind === "pi"
        ? {
            terms_snapshot: withPiExportSnapshot({}, defaultPiExportSnapshot()),
            bank_snapshot: defaultPiBankSnapshot(),
          }
        : {}),
      ...(customer ? { formal_customer_id: customer.formalCustomerId } : {}),
    },
  });
  return { data: result.header };
}
export function documentHeaderWrite(kind: DocumentKind, values: Values) {
  // Reuse commercial validation; PI validity belongs to its independent terms snapshot.
  const { status, valid_until: _validity, ...commercial } = values;
  const write = quoteHeaderWrite(commercial);
  if (status !== undefined) {
    if (
      !documentConfig[kind].statuses.includes(String(status)) &&
      !(kind === "order" && status === "voided")
    )
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

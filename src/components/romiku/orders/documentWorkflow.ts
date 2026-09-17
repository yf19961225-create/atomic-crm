import type { DataProvider } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { quoteHeaderWrite } from "../quotes/quoteWorkflow";

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
    label: "Order",
    plural: "Orders",
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
    throw new Error("Unsupported document conversion.");
  const { data, error } = await client.rpc("romiku_convert_document", {
    source_kind: source,
    source_id: sourceId,
    target_kind: target,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data)
    throw new Error("Conversion returned no document.");
  return data;
}
export async function createDocument(
  provider: DataProvider,
  kind: DocumentKind,
  buyerName: string,
) {
  if (!buyerName.trim()) throw new Error("Buyer name is required.");
  return provider.create(documentConfig[kind].resource, {
    data: {
      status: "draft",
      currency: "USD",
      deposit_percent: 30,
      counterparty_snapshot: { name: buyerName.trim() },
    },
  });
}
export function documentHeaderWrite(kind: DocumentKind, values: Values) {
  // Reuse commercial validation; PI validity belongs to its independent terms snapshot.
  const { status, valid_until: _validity, ...commercial } = values;
  const write = quoteHeaderWrite(commercial);
  if (status !== undefined) {
    if (!documentConfig[kind].statuses.includes(String(status)))
      throw new Error("Choose an approved document status.");
    write.status = status;
  }
  if (values.deposit_percent !== undefined) {
    const percent = Number(values.deposit_percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      throw new Error("Deposit percentage must be between 0 and 100.");
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
          throw new Error("Enter a valid date.");
        write[key] = date.toISOString();
      }
    }
  if (kind === "order" && values.purchase_order_number !== undefined)
    write.purchase_order_number = values.purchase_order_number;
  return write;
}

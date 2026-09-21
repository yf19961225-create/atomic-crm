import type { DataProvider } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";

export type QuoteSource = "direct" | "inquiry" | "outbound" | "customer";
export const quoteSourceResources = {
  inquiry: "romiku_website_inquiries",
  outbound: "romiku_outbound_companies",
  customer: "romiku_formal_customers",
};
export const quoteStatuses = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "cancelled",
];
type SnapshotRpc = {
  rpc: (
    name: string,
    args: { inquiry_id: string; selected_item_ids: string[] },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export async function quoteFromInquiry(
  client: SnapshotRpc,
  inquiryId: string,
  selectedIds: string[],
) {
  if (
    !inquiryId ||
    !selectedIds.length ||
    new Set(selectedIds).size !== selectedIds.length
  )
    throw new Error("请从询盘中选择不重复的产品项。");
  const { data, error } = await client.rpc("romiku_quote_from_inquiry", {
    inquiry_id: inquiryId,
    selected_item_ids: selectedIds,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data)
    throw new Error("报价单创建后未返回单据。");
  return data;
}
export async function createQuote(
  provider: DataProvider,
  source: Exclude<QuoteSource, "inquiry">,
  sourceId: string,
  buyerName: string,
  directCustomer?: { formalCustomerId: string; snapshot: Values },
) {
  let snapshot: Values;
  const links: Values = {};
  if (source === "direct") {
    if (!buyerName.trim()) throw new Error("采购方名称为必填项。");
    snapshot = directCustomer?.snapshot || { name: buyerName.trim() };
    if (directCustomer)
      links.formal_customer_id = directCustomer.formalCustomerId;
  } else {
    if (!sourceId) throw new Error("请选择来源记录。");
    const { data } = await provider.getOne(quoteSourceResources[source], {
      id: sourceId,
    });
    snapshot = Object.fromEntries(
      [
        "name",
        "country",
        "website",
        "address",
        "billing_address",
        "shipping_address",
        "email",
        "phone",
        "whatsapp",
      ]
        .filter((key) => data[key] != null)
        .map((key) => [key, data[key]]),
    );
    links[
      source === "outbound" ? "outbound_company_id" : "formal_customer_id"
    ] = sourceId;
  }
  return provider.create("romiku_quotes", {
    data: {
      status: "draft",
      currency: "USD",
      document_language: "zh",
      counterparty_snapshot: snapshot,
      ...links,
    },
  });
}
const pick = (values: Values, keys: string[]) =>
  Object.fromEntries(
    keys
      .filter((key) => values[key] !== undefined)
      .map((key) => [key, values[key]]),
  );
function nonnegative(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error(`${label} 必须是有限的非负数。`);
  return number;
}
export function quoteHeaderWrite(values: Values) {
  const write = pick(values, [
    "status",
    "counterparty_snapshot",
    "formal_customer_id",
    "bank_snapshot",
    "terms_snapshot",
    "currency",
    "document_number",
    "document_language",
    "document_date",
    "valid_until",
    "follow_up_at",
    "due_at",
    "freight",
    "discount",
    "other_expenses",
    "price_term",
    "shipment_method",
    "notes",
  ]);
  for (const key of ["freight", "discount", "other_expenses"])
    if (key in write) write[key] = nonnegative(write[key], key);
  for (const key of ["valid_until", "follow_up_at", "due_at"])
    if (write[key] === "") write[key] = null;
  if (write.currency !== undefined) {
    write.currency = String(write.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(String(write.currency)))
      throw new Error("请使用三位货币代码。");
  }
  if (write.document_number !== undefined) {
    write.document_number = String(write.document_number).trim();
    if (!write.document_number) throw new Error("单据编号不能为空。");
  }
  if (write.document_language !== undefined) {
    write.document_language = String(write.document_language).trim();
    if (!["zh", "en", "es"].includes(String(write.document_language)))
      throw new Error("请选择有效的单据语言。");
  }
  if (
    write.status !== undefined &&
    !quoteStatuses.includes(String(write.status))
  )
    throw new Error("请选择有效的报价单状态。");
  return write;
}
export function quoteItemWrite(values: Values) {
  const write = pick(values, [
    "sku",
    "quantity",
    "unit_price",
    "product_snapshot",
    "packing_snapshot",
    "requirement",
    "customer_code",
    "notes",
    "position",
  ]);
  write.sku = String(values.sku || "").trim();
  if (!write.sku) throw new Error("SKU 为必填项。");
  write.quantity = nonnegative(values.quantity, "数量");
  if (!write.quantity) throw new Error("数量必须大于零。");
  write.unit_price = nonnegative(values.unit_price ?? 0, "单价");
  const product = write.product_snapshot as Values | undefined;
  if (product?.moq !== undefined && product.moq !== "")
    write.product_snapshot = {
      ...product,
      moq: nonnegative(product.moq, "最小起订量"),
    };
  return write;
}
// Numeric columns store four decimal places; integer arithmetic preserves line rounding.
const scaled = (value: unknown) =>
  BigInt(
    Number(value || 0)
      .toFixed(4)
      .replace(".", ""),
  );
export function quoteTotals(items: Values[], quote: Values) {
  const subtotalCents = items.reduce(
    (sum, item) =>
      sum +
      (scaled(item.quantity) * scaled(item.unit_price) + 500000n) / 1000000n,
    0n,
  );
  const cents = (value: unknown) => (scaled(value) + 50n) / 100n;
  return {
    subtotal: Number(subtotalCents) / 100,
    total:
      Number(
        subtotalCents +
          cents(quote.freight) +
          cents(quote.other_expenses) -
          cents(quote.discount),
      ) / 100,
  };
}

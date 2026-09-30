import type { DataProvider } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import {
  defaultQuoteExportSnapshot,
  withQuoteExportSnapshot,
} from "./quoteExportSnapshot";

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
      terms_snapshot: withQuoteExportSnapshot({}, defaultQuoteExportSnapshot()),
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

type ExactDecimal = { scaled: bigint; scale: number };

function exactDecimal(value: unknown, maxScale: number, label: string) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw))
    throw new Error(`${label} 必须是有效的小数。`);
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > maxScale)
    throw new Error(`${label} 最多允许 ${maxScale} 位小数。`);
  return {
    scaled: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  } satisfies ExactDecimal;
}

function decimalNumber(value: unknown, maxScale: number, label: string) {
  const decimal = exactDecimal(value, maxScale, label);
  return Number(decimal.scaled) / 10 ** decimal.scale;
}

function positiveDecimal(value: unknown, maxScale: number, label: string) {
  const decimal = exactDecimal(value, maxScale, label);
  if (decimal.scaled <= 0n) throw new Error(`${label} 必须大于零。`);
  return Number(decimal.scaled) / 10 ** decimal.scale;
}

export function parseQuoteUsdCnyRate(value: unknown) {
  return positiveDecimal(value, 6, "USD 汇率");
}

export function parseQuoteSourceCnyUnitPrice(value: unknown) {
  return decimalNumber(value, 4, "人民币单价");
}

export function parseQuoteUsdUnitPrice(value: unknown) {
  return decimalNumber(value, 4, "单价");
}

/**
 * Divides exact user-entered decimal strings and rounds only the persisted
 * USD price to the existing four-decimal database contract.
 */
export function calculateQuoteUsdUnitPrice(
  sourceCnyUnitPrice: unknown,
  usdCnyRate: unknown,
) {
  const source = exactDecimal(sourceCnyUnitPrice, 4, "人民币单价");
  const rate = exactDecimal(usdCnyRate, 6, "USD 汇率");
  if (rate.scaled <= 0n) throw new Error("USD 汇率必须大于零。");
  const numerator = source.scaled * 10n ** BigInt(rate.scale + 4);
  const denominator = rate.scaled * 10n ** BigInt(source.scale);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  return Number(rounded) / 10_000;
}

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
    "fx_enabled",
    "usd_cny_rate",
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
  if (write.fx_enabled !== undefined) {
    if (typeof write.fx_enabled !== "boolean")
      throw new Error("启用汇率换算必须是布尔值。");
  }
  if (write.usd_cny_rate !== undefined) {
    write.usd_cny_rate =
      write.usd_cny_rate === null || write.usd_cny_rate === ""
        ? null
        : parseQuoteUsdCnyRate(write.usd_cny_rate);
  }
  if (write.fx_enabled === true && !write.usd_cny_rate)
    throw new Error("启用汇率换算时必须填写 USD 汇率。");
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
    "source_cny_unit_price",
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
  if (write.source_cny_unit_price !== undefined)
    write.source_cny_unit_price =
      write.source_cny_unit_price === null || write.source_cny_unit_price === ""
        ? null
        : parseQuoteSourceCnyUnitPrice(write.source_cny_unit_price);
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

import { describe, expect, it, vi } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import {
  createQuote,
  quoteFromInquiry,
  quoteHeaderWrite,
  quoteItemWrite,
  quoteTotals,
} from "./quoteWorkflow";

describe("Quote snapshot boundaries", () => {
  it("sends only confirmed distinct item IDs to the server snapshot RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "q-1", error: null });
    expect(await quoteFromInquiry({ rpc }, "in-1", ["i-2", "i-1"])).toBe("q-1");
    expect(rpc).toHaveBeenCalledWith("romiku_quote_from_inquiry", {
      inquiry_id: "in-1",
      selected_item_ids: ["i-2", "i-1"],
    });
    await expect(quoteFromInquiry({ rpc }, "in-1", [])).rejects.toThrow("选择");
    await expect(
      quoteFromInquiry({ rpc }, "in-1", ["i-1", "i-1"]),
    ).rejects.toThrow("不重复");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("surfaces snapshot failures without returning a phantom Quote", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Permission denied" },
    });
    await expect(quoteFromInquiry({ rpc }, "in-1", ["i-1"])).rejects.toThrow(
      "Permission denied",
    );
  });
  it("creates independent direct, outbound and customer quotes without creating customers or changing sources", async () => {
    const provider = fakeRestDataProvider({
      romiku_quotes: [],
      romiku_outbound_companies: [
        { id: "o", name: "Prospect", country: "DE", status: "replied" },
      ],
      romiku_formal_customers: [
        { id: "c", name: "Customer", status: "active" },
      ],
    });
    const direct = await createQuote(provider, "direct", "", "Manual buyer");
    const outbound = await createQuote(provider, "outbound", "o", "");
    const customer = await createQuote(provider, "customer", "c", "");
    expect(direct.data).toMatchObject({
      counterparty_snapshot: { name: "Manual buyer" },
    });
    expect(outbound.data).toMatchObject({
      outbound_company_id: "o",
      counterparty_snapshot: { name: "Prospect", country: "DE" },
    });
    expect(outbound.data.formal_customer_id).toBeUndefined();
    expect(customer.data).toMatchObject({
      formal_customer_id: "c",
      counterparty_snapshot: { name: "Customer" },
    });
    expect(
      (await provider.getOne("romiku_outbound_companies", { id: "o" })).data,
    ).toEqual({ id: "o", name: "Prospect", country: "DE", status: "replied" });
    expect(
      (
        await provider.getList("romiku_formal_customers", {
          pagination: { page: 1, perPage: 10 },
          sort: { field: "id", order: "ASC" },
          filter: {},
        })
      ).data,
    ).toHaveLength(1);
    await expect(createQuote(provider, "outbound", "", "")).rejects.toThrow(
      "来源",
    );
  });
  it("allows commercial edits while stripping source, identity, audit and calculated fields", () => {
    expect(
      quoteHeaderWrite({
        status: "draft",
        currency: "usd",
        other_expenses: "15",
        source_website_inquiry_id: "replacement",
        formal_customer_id: "created",
        document_number: "FORGED",
        total: 12,
      }),
    ).toEqual({ status: "draft", currency: "USD", other_expenses: 15 });
    expect(
      quoteItemWrite({
        sku: "A",
        quantity: "240",
        unit_price: "2",
        product_snapshot: {
          moq: 100,
          specification: "White",
          name: "Preserved",
        },
        packing_snapshot: { description: "Carton" },
        quote_id: "other",
        source_website_inquiry_item_id: "other",
        amount: 0,
      }),
    ).toEqual({
      sku: "A",
      quantity: 240,
      unit_price: 2,
      product_snapshot: { moq: 100, specification: "White", name: "Preserved" },
      packing_snapshot: { description: "Carton" },
    });
    expect(() =>
      quoteItemWrite({ sku: "A", quantity: 0, unit_price: 2 }),
    ).toThrow("数量");
    expect(() => quoteHeaderWrite({ other_expenses: -1 })).toThrow("非负数");
    expect(() =>
      quoteItemWrite({ sku: "A", quantity: 1, unit_price: Infinity }),
    ).toThrow();
  });
  it("rounds each line as PostgreSQL does and includes freight, other expenses and discount", () => {
    expect(
      quoteTotals([{ quantity: 240, unit_price: 2 }], {
        freight: 20,
        other_expenses: 15,
        discount: 10,
      }),
    ).toEqual({ subtotal: 480, total: 505 });
    expect(
      quoteTotals(
        [
          { quantity: 1, unit_price: 1.005 },
          { quantity: 1, unit_price: 1.005 },
        ],
        {},
      ),
    ).toEqual({ subtotal: 2.02, total: 2.02 });
  });
});

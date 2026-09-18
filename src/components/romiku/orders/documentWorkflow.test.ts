import { expect, it, vi } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import {
  convertDocument,
  createDocument,
  documentHeaderWrite,
} from "./documentWorkflow";
import { paymentSummary, paymentWrite } from "../payments/paymentWorkflow";

it.each([
  ["quote", "pi"],
  ["quote", "order"],
  ["pi", "order"],
] as const)(
  "converts %s to %s through the server snapshot boundary",
  async (source, target) => {
    const rpc = vi.fn().mockResolvedValue({ data: "new-id", error: null });
    expect(await convertDocument({ rpc }, source, "source-id", target)).toBe(
      "new-id",
    );
    expect(rpc).toHaveBeenCalledWith("romiku_convert_document", {
      source_kind: source,
      source_id: "source-id",
      target_kind: target,
    });
  },
);
it("rejects unsupported conversions and failed server copies", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: null, error: { message: "Source missing" } });
  await expect(convertDocument({ rpc }, "pi", "id", "pi")).rejects.toThrow(
    "不支持",
  );
  expect(rpc).not.toHaveBeenCalled();
  await expect(
    convertDocument({ rpc }, "quote", "id", "order"),
  ).rejects.toThrow("Source missing");
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(convertDocument({ rpc }, "quote", "id", "pi")).rejects.toThrow(
    "未返回单据",
  );
});
it("creates distinct direct PI and Order without creating Formal Customers", async () => {
  const provider = fakeRestDataProvider({
    romiku_pis: [],
    romiku_orders: [],
    romiku_formal_customers: [],
  });
  for (const kind of ["pi", "order"] as const) {
    const { data } = await createDocument(provider, kind, "  Buyer  ");
    expect(data).toMatchObject({
      status: "draft",
      currency: "USD",
      deposit_percent: 30,
      counterparty_snapshot: { name: "Buyer" },
    });
    expect(data.source_quote_id).toBeUndefined();
    expect(data.formal_customer_id).toBeUndefined();
  }
  expect(
    (
      await provider.getList("romiku_formal_customers", {
        pagination: { page: 1, perPage: 10 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      })
    ).data,
  ).toEqual([]);
  await expect(createDocument(provider, "order", " ")).rejects.toThrow(
    "采购方",
  );
});
it("permits independent commercial and delivery snapshots while stripping lineage and computed values", () => {
  expect(
    documentHeaderWrite("order", {
      status: "confirmed",
      currency: "eur",
      deposit_percent: "40",
      expected_delivery_at: "",
      source_pi_id: "replace",
      formal_customer_id: "new",
      total: 50,
      counterparty_snapshot: { name: "Independent" },
    }),
  ).toEqual({
    status: "confirmed",
    currency: "EUR",
    deposit_percent: 40,
    expected_delivery_at: null,
    counterparty_snapshot: { name: "Independent" },
  });
  expect(
    documentHeaderWrite("pi", {
      terms_snapshot: { valid_until: "2026-10-30" },
      expected_delivery_at: "2026-10-20",
      source_quote_id: "replace",
    }),
  ).toEqual({ terms_snapshot: { valid_until: "2026-10-30" } });
  expect(() => documentHeaderWrite("order", { deposit_percent: 101 })).toThrow(
    "100",
  );
});
it("calculates rounded deposit, balance, partial receipts and overpayment without binary float errors", () => {
  expect(
    paymentSummary(1000.01, 30, [
      { kind: "deposit", amount: 100.1 },
      { kind: "deposit", amount: 199.9 },
      { kind: "balance", amount: 200.01 },
    ]),
  ).toEqual({
    expectedDeposit: 300,
    expectedBalance: 700.01,
    depositReceived: 300,
    balanceReceived: 200.01,
    otherReceived: 0,
    totalReceived: 500.01,
    depositRemaining: 0,
    balanceRemaining: 500,
    outstanding: 500,
    overpaid: 0,
  });
  expect(
    paymentSummary(0.3, 50, [
      { kind: "deposit", amount: 0.1 },
      { kind: "balance", amount: 0.2 },
      { kind: "other", amount: 0.05 },
    ]),
  ).toMatchObject({
    expectedDeposit: 0.15,
    totalReceived: 0.35,
    outstanding: 0,
    overpaid: 0.05,
  });
});
it("validates receipts and excludes currency/order reassignment from payment updates", () => {
  expect(
    paymentWrite({
      kind: "deposit",
      amount: "12.30",
      received_at: "2026-09-17T10:00:00Z",
      notes: "Wire",
      order_id: "wrong",
      currency: "EUR",
    }),
  ).toEqual({
    kind: "deposit",
    amount: 12.3,
    received_at: "2026-09-17T10:00:00.000Z",
    notes: "Wire",
  });
  for (const amount of [0, -1, "NaN", "1.001"])
    expect(() =>
      paymentWrite({ kind: "deposit", amount, received_at: "2026-09-17" }),
    ).toThrow();
  expect(() =>
    paymentWrite({ kind: "balance", amount: 10, received_at: "invalid" }),
  ).toThrow("日期");
});

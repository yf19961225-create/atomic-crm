import { beforeEach, expect, it, vi } from "vitest";
import rawFakeRestDataProvider from "ra-data-fakerest";
import { withAtomicDocuments } from "../commercial/tests/withAtomicDocuments";
const fakeRestDataProvider = (
  ...args: Parameters<typeof rawFakeRestDataProvider>
) => withAtomicDocuments(rawFakeRestDataProvider(...args));
import {
  convertDocument,
  createDocument,
  documentHeaderWrite,
} from "./documentWorkflow";
import { paymentSummary, paymentWrite } from "../payments/paymentWorkflow";

it("initializes direct PI export and banking snapshots", async () => {
  const provider = fakeRestDataProvider({
    romiku_pis: [],
    romiku_pi_items: [],
  });
  const { data } = await createDocument(provider, "pi", "Buyer");
  expect(data.terms_snapshot).toMatchObject({
    pi_export: { template_key: "pi", terms_visible: true },
  });
  expect(data.bank_snapshot).toMatchObject({ bank_information_visible: true });
});

it.each([
  ["quote", "pi"],
  ["quote", "order"],
  ["pi", "order"],
] as const)(
  "converts %s to %s with captured source revision",
  async (source, target) => {
    const provider = fakeRestDataProvider({});
    const create = vi.fn().mockResolvedValue({ document_id: "new-id" });
    provider.documentCreateFromSource = create;
    expect(
      await convertDocument(provider, source, "source-id", target, 7),
    ).toBe("new-id");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: source,
        sourceId: "source-id",
        targetKind: target,
        expectedSourceRevision: 7,
        requestId: expect.any(String),
      }),
    );
  },
);
it("rejects unsupported conversions and failed server copies", async () => {
  const provider = fakeRestDataProvider({});
  const create = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new Error("Source missing"), { code: "P0002" }),
    );
  provider.documentCreateFromSource = create;
  await expect(convertDocument(provider, "pi", "id", "pi", 1)).rejects.toThrow(
    "不支持",
  );
  expect(create).not.toHaveBeenCalled();
  await expect(
    convertDocument(provider, "quote", "id", "order", 1),
  ).rejects.toThrow("Source missing");
});
it("creates distinct direct PI and Order without creating Formal Customers", async () => {
  const provider = fakeRestDataProvider({
    romiku_pis: [],
    romiku_pi_items: [],
    romiku_order_items: [],
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
    if (kind === "order")
      expect(
        (
          data.terms_snapshot as {
            order_export: { terms: { payment: { text: string } } };
          }
        ).order_export.terms.payment.text,
      ).toContain("30% deposit by T/T in advance");
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
      document_number: " RCI260920001 ",
      document_name: "Tú 补货",
      total: 50,
      counterparty_snapshot: { name: "Independent" },
    }),
  ).toEqual({
    status: "confirmed",
    currency: "EUR",
    deposit_percent: 40,
    expected_delivery_at: null,
    formal_customer_id: "new",
    document_name: "Tú 补货",
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
      payment_account: "HSBC USD",
      payment_reference: "TT-001",
      order_id: "wrong",
      currency: "EUR",
    }),
  ).toEqual({
    kind: "deposit",
    amount: 12.3,
    received_at: "2026-09-17T10:00:00.000Z",
    notes: "Wire",
    payment_account: "HSBC USD",
    payment_reference: "TT-001",
  });
  for (const amount of [0, -1, "NaN", "1.001"])
    expect(() =>
      paymentWrite({ kind: "deposit", amount, received_at: "2026-09-17" }),
    ).toThrow();
  expect(() =>
    paymentWrite({ kind: "balance", amount: 10, received_at: "invalid" }),
  ).toThrow("日期");
});

it("accepts the unpaid order stage without altering financial facts or allowing it on PI", () => {
  expect(
    documentHeaderWrite("order", {
      status: "awaiting_payment",
      total: 10000,
      paid: 2913,
    }),
  ).toEqual({ status: "awaiting_payment" });
  expect(() =>
    documentHeaderWrite("pi", { status: "awaiting_payment" }),
  ).toThrow("有效的单据状态");
});

beforeEach(() => sessionStorage.clear());

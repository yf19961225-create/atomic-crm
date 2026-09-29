import { expect, it } from "vitest";
import { normalizeOrderExportModel } from "./orderExportModel";
import { planOrderPdf, renderOrderPdf } from "./orderPdfRenderer";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M/wHwAFAgH/1skBYAAAAABJRU5ErkJggg==";

const modelWithItems = (count: number) =>
  normalizeOrderExportModel(
    {
      document_number: "OD260929001",
      document_date: "2026-09-29",
      currency: "USD",
      freight: 12,
      deposit_percent: 30,
      notes: "Use customer logo packaging. 客户 logo 包装。",
      counterparty_snapshot: {
        name: "义乌客户 / Saved Buyer",
        address: "义乌市国际商贸城",
      },
    },
    Array.from({ length: count }, (_, index) => ({
      id: String(index + 1),
      position: index + 1,
      sku: `SUN-${index + 1}`,
      quantity: index + 1,
      unit_price: 10,
      product_snapshot: {
        name: `美甲灯 ${index + 1}`,
        specification: "48W 插电 / Plug-in",
        image_url: pixel,
      },
      packing_snapshot: { cartons: 1, qty_per_carton: index + 1 },
    })),
  );

it("renders bilingual saved snapshots, product images, and an A4 portrait PDF", async () => {
  const model = modelWithItems(1);
  const pdf = await renderOrderPdf(model);
  expect(pdf.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  expect(pdf.byteLength).toBeGreaterThan(1000);
  expect(new TextDecoder("latin1").decode(pdf)).toContain("/Image");
}, 45_000);

it.each([1, 3, 8, 21])(
  "plans %i item rows without splitting summary or individual Terms blocks",
  (count) => {
    const plan = planOrderPdf(modelWithItems(count));
    expect(plan.pages).not.toHaveLength(0);
    expect(plan.pages.flatMap((page) => page.items)).toHaveLength(count);
    expect(plan.pages.filter((page) => page.summary).length).toBe(1);
    expect(plan.pages.flatMap((page) => page.terms)).toHaveLength(8);
    expect(
      plan.pages.find((page) => page.summary)?.summary?.height,
    ).toBeGreaterThan(0);
  },
);

it("moves the complete Summary block to a fresh page when remaining product space is insufficient", () => {
  const plan = planOrderPdf(modelWithItems(21));
  const summaryPage = plan.pages.findIndex((page) => page.summary);
  expect(summaryPage).toBeGreaterThan(0);
  expect(plan.pages[summaryPage].summary?.rows).toHaveLength(6);
});

it("removes only the hidden payment Terms block", () => {
  const model = modelWithItems(3);
  model.terms = model.terms.filter((term) => term.key !== "payment");
  const plan = planOrderPdf(model);
  expect(plan.pages.flatMap((page) => page.terms)).toHaveLength(7);
});

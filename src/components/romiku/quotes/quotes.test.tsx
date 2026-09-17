import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { page } from "vitest/browser";
import { romikuRoutes } from "../routes/RomikuRoutes";
import "@/index.css";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const list = {
  pagination: { page: 1, perPage: 100 },
  sort: { field: "id", order: "ASC" as const },
  filter: {},
};
const setup = async (path: string) => {
  await page.viewport(1440, 1000);
  rpc.mockReset().mockResolvedValue({ data: "q", error: null });
  const provider = fakeRestDataProvider({
    romiku_quotes: [
      {
        id: "q",
        document_number: "Q-001",
        status: "draft",
        currency: "USD",
        counterparty_snapshot: { name: "Ana" },
        source_website_inquiry_id: "in",
        freight: 20,
        other_expenses: 15,
        discount: 10,
        terms_snapshot: {},
      },
    ],
    romiku_quote_totals: [],
    romiku_quote_items: [
      {
        id: "qi",
        quote_id: "q",
        source_website_inquiry_item_id: "i1",
        sku: "A",
        quantity: 100,
        unit_price: 2,
        product_snapshot: { name: "Original snapshot" },
        packing_snapshot: {},
      },
    ],
    romiku_website_inquiries: [
      {
        id: "in",
        document_number: "WI-1",
        customer_name: "Ana",
        email: "ana@example.test",
        status: "new",
        raw_payload: { original: true },
      },
    ],
    romiku_website_inquiry_items: [
      {
        id: "i1",
        inquiry_id: "in",
        sku: "A",
        quantity: 100,
        requirement: "White",
      },
      { id: "i2", inquiry_id: "in", sku: "B", quantity: 20 },
    ],
    romiku_website_inquiry_followups: [],
    romiku_formal_customers: [],
    romiku_outbound_companies: [],
    sales: [],
  });
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
};

it("opens inquiry selection without creating a Quote, then confirms only the selected originals", async () => {
  const { screen } = await setup("/website-inquiries?record=in");
  await screen.getByRole("link", { name: "Create Quote" }).click();
  await expect
    .element(screen.getByRole("heading", { name: "Confirm inquiry items" }))
    .toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByLabelText("Include B").click();
  await screen
    .getByRole("button", { name: "Confirm and create Quote" })
    .click();
  await expect
    .element(screen.getByRole("heading", { name: "Q-001" }))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledWith("romiku_quote_from_inquiry", {
    inquiry_id: "in",
    selected_item_ids: ["i1"],
  });
});

it("edits and removes Quote snapshots while leaving inquiry and customer archives untouched", async () => {
  const { screen, provider } = await setup("/quotes/q");
  const original = (
    await provider.getList("romiku_website_inquiry_items", list)
  ).data;
  await screen.getByRole("tab", { name: "Items", exact: true }).click();
  await screen.getByLabelText("Quantity", { exact: true }).fill("240");
  await screen.getByLabelText("MOQ", { exact: true }).fill("120");
  await screen
    .getByLabelText("Specification", { exact: true })
    .fill("Blue finish");
  await screen.getByLabelText("Packaging", { exact: true }).fill("Carton");
  await screen.getByRole("button", { name: "Save item", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_quote_items", { id: "qi" })).data
          .quantity,
    )
    .toBe(240);
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data,
  ).toMatchObject({
    source_website_inquiry_item_id: "i1",
    product_snapshot: {
      name: "Original snapshot",
      moq: 120,
      specification: "Blue finish",
    },
    packing_snapshot: { description: "Carton" },
  });
  await expect
    .element(screen.getByText("Total: USD 505.00", { exact: true }))
    .toBeVisible();
  await screen.getByRole("tab", { name: "Terms & expenses" }).click();
  await screen.getByLabelText("Other expenses", { exact: true }).fill("25");
  await screen
    .getByLabelText("Payment terms", { exact: true })
    .fill("50% deposit");
  await screen.getByRole("button", { name: "Save Quote" }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_quotes", { id: "q" })).data
          .other_expenses,
    )
    .toBe(25);
  await expect
    .element(screen.getByText("Total: USD 515.00", { exact: true }))
    .toBeVisible();
  await screen.getByRole("tab", { name: "Items", exact: true }).click();
  await screen.getByRole("button", { name: "Remove item" }).click();
  await expect
    .poll(
      async () =>
        (await provider.getList("romiku_quote_items", list)).data.length,
    )
    .toBe(0);
  expect(
    (await provider.getList("romiku_website_inquiry_items", list)).data,
  ).toEqual(original);
  expect(
    (await provider.getList("romiku_formal_customers", list)).data,
  ).toEqual([]);
});

it("creates a direct Quote and supports adding its own items", async () => {
  const { screen, provider } = await setup("/quotes");
  await screen.getByRole("link", { name: "New Quote" }).click();
  await screen
    .getByLabelText("Buyer name", { exact: true })
    .fill("Direct buyer");
  await screen
    .getByRole("button", { name: "Create Quote", exact: true })
    .click();
  await screen.getByRole("tab", { name: "Items", exact: true }).click();
  await screen.getByRole("button", { name: "Add item" }).click();
  await screen.getByLabelText("SKU", { exact: true }).fill("MANUAL");
  await screen.getByLabelText("Quantity", { exact: true }).fill("10");
  await screen.getByLabelText("Unit price", { exact: true }).fill("3.5");
  await screen.getByRole("button", { name: "Save item" }).click();
  await expect
    .element(screen.getByText("Total: USD 35.00", { exact: true }))
    .toBeVisible();
  expect(
    (await provider.getList("romiku_formal_customers", list)).data,
  ).toEqual([]);
});

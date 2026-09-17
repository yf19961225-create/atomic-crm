import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { page } from "vitest/browser";
import { romikuRoutes } from "../routes/RomikuRoutes";
import { readRelated } from "../outbound/workflow";
import "@/index.css";
async function setup(path: string) {
  await page.viewport(1440, 1200);
  const provider = fakeRestDataProvider({
    romiku_orders: [{ id: "o", document_number: "SO-001" }],
    romiku_order_items: [
      {
        id: "i",
        order_id: "o",
        sku: "A",
        quantity: 100,
        product_snapshot: { name: "Lamp" },
        packing_snapshot: {},
      },
      {
        id: "j",
        order_id: "o",
        sku: "B",
        quantity: 200,
        product_snapshot: { name: "Table" },
        packing_snapshot: {},
      },
    ],
    romiku_order_item_remaining: [
      {
        id: "i",
        order_id: "o",
        ordered_quantity: 100,
        packed_quantity: 40,
        remaining_quantity: 60,
      },
      {
        id: "j",
        order_id: "o",
        ordered_quantity: 200,
        packed_quantity: 0,
        remaining_quantity: 200,
      },
    ],
    romiku_suppliers: [
      { id: "s1", name: "Factory One" },
      { id: "s2", name: "Factory Two" },
    ],
    romiku_production_orders: [],
    romiku_production_items: [],
    romiku_packing_lists: [
      { id: "p", document_number: "PL-001", order_id: "o" },
    ],
    romiku_packing_items: [],
  });
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { provider, screen };
}
it("creates selected production items under separate supplier snapshots through the ROMIKU route", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("Select A", { exact: true }).click();
  await screen
    .getByLabelText("Supplier A", { exact: true })
    .selectOptions("s1");
  await screen.getByLabelText("Select B", { exact: true }).click();
  await screen
    .getByLabelText("Supplier B", { exact: true })
    .selectOptions("s2");
  await screen
    .getByRole("button", { name: "Create Production Orders", exact: true })
    .click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Created 2 Production Orders");
  const rows = await readRelated(provider, "romiku_production_orders", {});
  expect(rows.map((r) => r.supplier_snapshot.name)).toEqual([
    "Factory One",
    "Factory Two",
  ]);
  expect(
    (await readRelated(provider, "romiku_order_items", {}))[0].quantity,
  ).toBe(100);
});
it("shows ordered, packed and remaining quantities and blocks packing over the remaining amount", async () => {
  const { screen, provider } = await setup("/packing-shipping/p");
  await screen.getByRole("button", { name: "Add packing item" }).click();
  await screen.getByLabelText("Order item", { exact: true }).selectOptions("i");
  await expect
    .element(
      screen.getByText("Ordered: 100 · Already packed: 40 · Remaining: 60", {
        exact: true,
      }),
    )
    .toBeVisible();
  await screen.getByLabelText("Quantity", { exact: true }).fill("61");
  await screen.getByRole("button", { name: "Save packing item" }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(/remaining/i);
  expect(await readRelated(provider, "romiku_packing_items", {})).toHaveLength(
    0,
  );
  await screen.getByLabelText("Quantity", { exact: true }).fill("20");
  await screen.getByLabelText("Cartons", { exact: true }).fill("2");
  await screen
    .getByLabelText("Quantity per carton", { exact: true })
    .fill("10");
  await screen.getByLabelText("Length (cm)", { exact: true }).fill("50");
  await screen.getByLabelText("Width (cm)", { exact: true }).fill("40");
  await screen.getByLabelText("Height (cm)", { exact: true }).fill("30");
  await screen
    .getByLabelText("Weight per carton (kg)", { exact: true })
    .fill("8");
  await screen.getByRole("button", { name: "Save packing item" }).click();
  await expect
    .element(
      screen.getByText("Total: 2 cartons · 0.120 m³ · 16.00 kg", {
        exact: true,
      }),
    )
    .toBeVisible();
  expect(
    (await readRelated(provider, "romiku_order_items", {}))[0].quantity,
  ).toBe(100);
});
it("creates multiple Packing Lists for the same Order and edits only the copied line", async () => {
  const { screen, provider } = await setup("/packing-shipping/new?order=o");
  await screen
    .getByRole("button", { name: "Create Packing List", exact: true })
    .click();
  await screen.getByRole("button", { name: "Add packing item" }).click();
  await screen.getByLabelText("Order item", { exact: true }).selectOptions("i");
  await screen.getByLabelText("Quantity", { exact: true }).fill("10");
  await screen
    .getByLabelText("Product name", { exact: true })
    .fill("Packing copy");
  await screen
    .getByLabelText("Item shipping mark", { exact: true })
    .fill("MARK");
  await screen.getByRole("button", { name: "Save packing item" }).click();
  await screen.getByRole("button", { name: "Edit packing item" }).click();
  await screen.getByLabelText("Quantity", { exact: true }).fill("15");
  await screen.getByRole("button", { name: "Save packing item" }).click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_packing_items", {}))[0].quantity,
    )
    .toBe(15);
  const line = (await readRelated(provider, "romiku_packing_items", {}))[0];
  expect(line.product_snapshot).toEqual({
    name: "Packing copy",
    shipping_mark: "MARK",
  });
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data
      .product_snapshot,
  ).toEqual({ name: "Lamp" });
  expect(
    await readRelated(provider, "romiku_packing_lists", { order_id: "o" }),
  ).toHaveLength(2);
});
it("edits a Production Order copy while retaining its single supplier and Order source", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("Select A", { exact: true }).click();
  await screen
    .getByLabelText("Supplier A", { exact: true })
    .selectOptions("s1");
  await screen
    .getByRole("button", { name: "Create Production Orders", exact: true })
    .click();
  await screen.getByRole("link", { name: "Factory One", exact: true }).click();
  await screen.getByRole("button", { name: "Edit production item" }).click();
  await expect
    .element(screen.getByLabelText("Order item", { exact: true }))
    .toBeDisabled();
  await screen
    .getByLabelText("Product name", { exact: true })
    .fill("Factory copy");
  await screen.getByLabelText("Quantity", { exact: true }).fill("30");
  await screen
    .getByRole("button", { name: "Save production item", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_production_items", {}))[0]
          .quantity,
    )
    .toBe(30);
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data
      .product_snapshot,
  ).toEqual({ name: "Lamp" });
  expect(
    (await readRelated(provider, "romiku_production_orders", {}))[0]
      .supplier_id,
  ).toBe("s1");
});

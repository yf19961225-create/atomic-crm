import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes, Route } from "react-router";
import { SupplierEdit } from "./SupplierForms";
import "@/index.css";

async function setup(fail = false) {
  const provider = fakeRestDataProvider({
    romiku_suppliers: [
      {
        id: "qa",
        name: "Original",
        region: "Old",
        notes: "Old notes",
        status: "active",
        categories: [],
      },
    ],
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = provider.update;
  const update = vi
    .spyOn(provider, "update")
    .mockImplementation(async (...args) => {
      await pending;
      if (fail) throw new Error("Synthetic failure");
      return original(...args);
    });
  const screen = await render(
    <MemoryRouter initialEntries={["/romiku_suppliers/qa"]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>
          <Route path="/romiku_suppliers/:id" element={<SupplierEdit />} />
          <Route
            path="/suppliers"
            element={<div>Supplier list destination</div>}
          />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByLabelText("供应商名称"))
    .toHaveValue("Original");
  await screen.getByLabelText("供应商名称").fill("Changed");
  await screen.getByLabelText("地区").fill("New region");
  await screen.getByLabelText("备注").fill("New notes");
  return { screen, provider, update, release };
}

it("submits immediately without Notification, waits for persistence and prevents duplicate saves", async () => {
  const { screen, provider, update, release } = await setup();
  await screen.getByRole("button", { name: /save|保存/i }).click();
  await expect.poll(() => update.mock.calls.length).toBe(1);
  await expect
    .element(screen.getByText("Supplier list destination"))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: /save|保存/i }))
    .toBeDisabled();
  release();
  await expect
    .element(screen.getByText("Supplier list destination"))
    .toBeVisible();
  expect(
    (await provider.getOne("romiku_suppliers", { id: "qa" })).data,
  ).toMatchObject({
    name: "Changed",
    region: "New region",
    notes: "New notes",
  });
});

it("keeps edits and shows an inline error when persistence fails", async () => {
  const { screen, provider, release } = await setup(true);
  await screen.getByRole("button", { name: /save|保存/i }).click();
  release();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("供应商保存失败");
  await expect
    .element(screen.getByLabelText("供应商名称"))
    .toHaveValue("Changed");
  await expect
    .element(screen.getByText("Supplier list destination"))
    .not.toBeInTheDocument();
  expect(
    (await provider.getOne("romiku_suppliers", { id: "qa" })).data.name,
  ).toBe("Original");
});

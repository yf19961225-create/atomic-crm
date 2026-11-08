import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes, Route } from "react-router";
import {
  ProductExtensionEdit,
  ProductSupplierEdit,
  ProductExtensionCreate,
  ProductSupplierCreate,
  ProcurementCostCreate,
} from "./ProductForms";
import "@/index.css";

for (const kind of ["extension", "supplier"] as const) {
  const resource =
    kind === "extension"
      ? "romiku_product_extensions"
      : "romiku_product_suppliers";
  const Editor =
    kind === "extension" ? ProductExtensionEdit : ProductSupplierEdit;
  async function setup(fail = false) {
    const provider = fakeRestDataProvider({
      [resource]: [
        {
          id: "qa",
          sku: "QA-FORMS",
          internal_notes: "Before",
          notes: "Before",
          supplier_id: "qa-s",
          active: true,
        },
      ],
      romiku_suppliers: [{ id: "qa-s", name: "QA Supplier" }],
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
        if (fail) throw new Error("Synthetic permission failure");
        return original(...args);
      });
    const screen = await render(
      <MemoryRouter initialEntries={[`/${resource}/qa`]}>
        <CoreAdminContext dataProvider={provider}>
          <Routes>
            <Route path={`/${resource}/:id`} element={<Editor />} />
            <Route
              path="/product-library"
              element={<div>Library destination</div>}
            />
          </Routes>
        </CoreAdminContext>
      </MemoryRouter>,
    );
    const note = screen.getByLabelText(
      kind === "extension" ? "内部备注" : "备注",
      { exact: true },
    );
    await expect.element(note).toHaveValue("Before");
    await note.fill("Changed");
    return { screen, note, provider, update, release };
  }
  it(`${kind}: submits immediately, waits for persistence and prevents duplicate clicks`, async () => {
    const { screen, provider, update, release } = await setup();
    await screen.getByRole("button", { name: /save|保存/i }).click();
    await expect.poll(() => update.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByText("Library destination"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /save|保存/i }))
      .toBeDisabled();
    release();
    await expect.element(screen.getByText("Library destination")).toBeVisible();
    expect((await provider.getOne(resource, { id: "qa" })).data).toMatchObject({
      [kind === "extension" ? "internal_notes" : "notes"]: "Changed",
      sku: "QA-FORMS",
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
  it(`${kind}: keeps input and shows an error if persistence fails`, async () => {
    const { screen, note, release } = await setup(true);
    await screen.getByRole("button", { name: /save|保存/i }).click();
    release();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("保存失败");
    await expect.element(note).toHaveValue("Changed");
    await expect
      .element(screen.getByText("Library destination"))
      .not.toBeInTheDocument();
  });
}

for (const [resource, Creator] of [
  ["romiku_product_extensions", ProductExtensionCreate],
  ["romiku_product_suppliers", ProductSupplierCreate],
  ["romiku_procurement_cost_history", ProcurementCostCreate],
] as const) {
  async function setupCreate(fail = false) {
    const provider = fakeRestDataProvider({
      romiku_product_extensions: [],
      romiku_product_suppliers: [
        { id: "relation", sku: "QA-RELATED", supplier_id: "supplier" },
      ],
      romiku_procurement_cost_history: [],
      romiku_suppliers: [{ id: "supplier", name: "QA Supplier" }],
    });
    const original = provider.create;
    const create = vi
      .spyOn(provider, "create")
      .mockImplementation(async (...args) => {
        if (fail) throw new Error("Synthetic create denial");
        return original(...args);
      });
    const screen = await render(
      <MemoryRouter
        initialEntries={["/product-library", `/${resource}/create`]}
        initialIndex={1}
      >
        <CoreAdminContext dataProvider={provider}>
          <Routes>
            <Route path={`/${resource}/create`} element={<Creator />} />
            <Route
              path="/product-library"
              element={<div>Library destination</div>}
            />
          </Routes>
        </CoreAdminContext>
      </MemoryRouter>,
    );
    if (resource === "romiku_procurement_cost_history") {
      await screen.getByRole("combobox").click();
      await screen.getByRole("option", { name: "QA-RELATED" }).click();
      await screen.getByLabelText(/^成本/).fill("19.5");
      await screen.getByLabelText(/币种/).fill("cny");
      await screen.getByLabelText(/^生效日期/).fill("2026-11-08");
      await screen.getByLabelText(/来源类型/).fill("manual");
    } else {
      await screen.getByLabelText(/^SKU/).fill("QA-CREATE");
      if (resource === "romiku_product_suppliers") {
        await screen.getByRole("combobox").click();
        await screen.getByRole("option", { name: "QA Supplier" }).click();
      }
    }
    return { screen, create };
  }
  it(`${resource}: create keeps original resource and association`, async () => {
    const { screen, create } = await setupCreate();
    await screen.getByRole("button", { name: /save|保存/i }).click();
    await expect.element(screen.getByText("Library destination")).toBeVisible();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBe(resource);
    expect(create.mock.calls[0][1].data).toMatchObject(
      resource === "romiku_procurement_cost_history"
        ? {
            product_supplier_id: "relation",
            cost: 19.5,
            currency: "CNY",
            effective_date: "2026-11-08",
          }
        : resource === "romiku_product_suppliers"
          ? { sku: "QA-CREATE", supplier_id: "supplier" }
          : { sku: "QA-CREATE" },
    );
  });
  it(`${resource}: failed create shows error and retains draft`, async () => {
    const { screen, create } = await setupCreate(true);
    await screen.getByRole("button", { name: /save|保存/i }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("保存失败");
    await expect
      .element(screen.getByText("Library destination"))
      .not.toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it(`${resource}: cancel never creates a row`, async () => {
    const { screen, create } = await setupCreate();
    await screen.getByRole("button", { name: /cancel|取消/i }).click();
    await expect.element(screen.getByText("Library destination")).toBeVisible();
    expect(create).not.toHaveBeenCalled();
  });
}

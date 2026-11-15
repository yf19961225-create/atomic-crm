import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CommercialItemDrawer } from "./CommercialItemDrawer";
it("allows repairing a quotation's invalid hidden quantity without replacing the product", async () => {
  const save = vi.fn();
  const screen = await render(
    <CommercialItemDrawer
      quote
      item={{
        id: "draft-test",
        sku: "QA",
        quantity: 0,
        unit_price: 8,
        packing_snapshot: { qty_per_carton: 30, carton_cbm: 0.15 },
      }}
      onClose={() => {}}
      onSave={save}
    />,
  );
  await screen.getByLabelText("报价数量").fill("0.25");
  await screen.getByRole("button", { name: "保存详情", exact: true }).click();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      sku: "QA",
      quantity: 0.25,
      unit_price: 8,
      packing_snapshot: expect.objectContaining({
        qty_per_carton: 30,
        carton_cbm: 0.15,
      }),
    }),
  );
});

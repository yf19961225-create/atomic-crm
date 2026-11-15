import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ProductLanguageSelector } from "./ProductLanguageSelector";
it("requires an explicit conversion choice and preserves the source draft on cancel", async () => {
  const change = vi.fn();
  const item = {
    id: "line",
    sku: "SKU",
    quantity: 1,
    unit_price: 2,
    product_snapshot: { name: "manual" },
  };
  const screen = await render(
    <ProductLanguageSelector
      value="zh"
      editable
      items={[item]}
      onChange={change}
    />,
  );
  await screen
    .getByLabelText("产品语言 / Product Language")
    .selectOptions("en");
  expect(change).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(change).not.toHaveBeenCalled();
  await screen
    .getByLabelText("产品语言 / Product Language")
    .selectOptions("es");
  await screen
    .getByRole("button", { name: "仅用于新产品", exact: true })
    .click();
  expect(change).toHaveBeenCalledWith("es", undefined);
  expect(item.product_snapshot.name).toBe("manual");
});

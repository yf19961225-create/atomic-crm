import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentFinancialSummary } from "./DocumentFinancialSummary";

it("calculates first-page totals from staged rows and keeps optional fees empty", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DocumentFinancialSummary
      editable
      items={[{ id: "i", sku: "A", quantity: 2, unit_price: 10 }]}
      values={{ currency: "USD", freight: "", other_expenses: "", discount: 1 }}
      onChange={onChange}
    />,
  );
  await expect.element(screen.getByText("小计：USD 20.00")).toBeVisible();
  await expect.element(screen.getByText("合计：USD 19.00")).toBeVisible();
  await screen.getByLabelText("运费", { exact: true }).fill("5");
  expect(onChange).toHaveBeenLastCalledWith({
    currency: "USD",
    freight: "5",
    other_expenses: "",
    discount: 1,
  });
});

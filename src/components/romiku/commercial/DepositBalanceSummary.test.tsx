import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DepositBalanceSummary } from "./DepositBalanceSummary";

it("derives deposit and balance amounts from the existing deposit percent", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DepositBalanceSummary
      editable
      total={1000}
      currency="USD"
      values={{ deposit_percent: 30 }}
      onChange={onChange}
    />,
  );
  await expect
    .element(screen.getByLabelText("定金金额", { exact: true }))
    .toHaveValue(300);
  await expect.element(screen.getByText(/尾款：USD 700.00/)).toBeVisible();
  await screen.getByLabelText("定金金额", { exact: true }).fill("250");
  expect(onChange).toHaveBeenLastCalledWith({ deposit_percent: 25 });
});

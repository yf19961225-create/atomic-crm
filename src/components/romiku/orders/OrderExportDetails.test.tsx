import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { orderExportSnapshot } from "./orderExportSnapshot";
import { OrderExportDetails } from "./OrderExportDetails";

it("stores the complete Terms visibility switch in the current Order export snapshot", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <OrderExportDetails values={{}} editable onChange={onChange} />,
  );

  await screen.getByRole("button", { name: /导出信息/ }).click();
  const toggle = screen.getByLabelText("显示条款与条件");
  await expect.element(toggle).toBeChecked();
  await toggle.click();

  const next = onChange.mock.lastCall?.[0] as Record<string, unknown>;
  expect(orderExportSnapshot(next.terms_snapshot).terms_visible).toBe(false);
});

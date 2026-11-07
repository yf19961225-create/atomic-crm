import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import { InlineOrderDeliveryDate } from "./InlineOrderDeliveryDate";

it("opens immediately and saves only the Shanghai delivery date through the existing provider", async () => {
  const record = {
    id: "qa",
    expected_delivery_at: "2026-11-10T08:00:00Z",
    document_date: "2026-10-01",
    total: 7370,
  };
  const update = vi.fn(async (_resource, params) => ({
    data: { ...record, ...params.data },
  }));
  const screen = await render(
    <CoreAdminContext dataProvider={{ update } as any}>
      <InlineOrderDeliveryDate record={record} />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "送货日期 qa" }).click();
  await screen.getByRole("button", { name: "2026-11-20", exact: true }).click();
  expect(update).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(update).toHaveBeenCalledWith("romiku_orders", {
    id: "qa",
    data: { expected_delivery_at: "2026-11-20T08:00:00.000Z" },
    previousData: record,
  });
  await expect
    .element(screen.getByRole("button", { name: "送货日期 qa" }))
    .toHaveTextContent("2026-11-20");
});
it("retains an unsaved selection on failure and cancels without another write", async () => {
  const update = vi.fn().mockRejectedValue(new Error("拒绝保存"));
  const screen = await render(
    <CoreAdminContext dataProvider={{ update } as any}>
      <InlineOrderDeliveryDate
        record={{ id: "qa", expected_delivery_at: null }}
      />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "送货日期 qa" }).click();
  await screen.getByLabelText("日历年份").selectOptions("2026");
  await screen.getByLabelText("日历月份").selectOptions("12");
  await screen.getByRole("button", { name: "2026-12-01", exact: true }).click();
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("拒绝保存");
  await expect
    .element(screen.getByRole("button", { name: "送货日期 qa" }))
    .toHaveTextContent("2026-12-01");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(update).toHaveBeenCalledTimes(1);
  await expect
    .element(screen.getByRole("button", { name: "送货日期 qa" }))
    .toHaveTextContent("设置日期");
});

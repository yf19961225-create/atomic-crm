import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { withAtomicDocuments } from "../commercial/tests/withAtomicDocuments";
beforeEach(() => sessionStorage.clear());
import { InlineOrderDeliveryDate } from "./InlineOrderDeliveryDate";

it("opens immediately and saves only the Shanghai delivery date through the existing provider", async () => {
  const record = {
    id: "qa",
    expected_delivery_at: "2026-11-10T08:00:00Z",
    document_date: "2026-10-01",
    total: 7370,
  };
  const provider = withAtomicDocuments(
    fakeRestDataProvider({ romiku_orders: [record], romiku_order_items: [] }),
  );
  const update = vi.spyOn(provider, "documentSave");
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <InlineOrderDeliveryDate record={record} />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "送货日期 qa" }).click();
  await screen.getByRole("button", { name: "2026-11-20", exact: true }).click();
  expect(update).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "order",
      documentId: "qa",
      expectedRevision: 1,
      header: { expected_delivery_at: "2026-11-20T08:00:00.000Z" },
      items: null,
    }),
  );
  await expect
    .element(screen.getByRole("button", { name: "送货日期 qa" }))
    .toHaveTextContent("2026-11-20");
});
it("retains an unsaved selection on failure and cancels without another write", async () => {
  const provider = withAtomicDocuments(
    fakeRestDataProvider({
      romiku_orders: [{ id: "qa", expected_delivery_at: null }],
      romiku_order_items: [],
    }),
  );
  const update = vi
    .spyOn(provider, "documentSave")
    .mockRejectedValue(Object.assign(new Error("拒绝保存"), { code: "42501" }));
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
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

it("rejects a field changed by another user without issuing a write", async () => {
  const provider = withAtomicDocuments(
    fakeRestDataProvider({
      romiku_orders: [
        { id: "qa", expected_delivery_at: "2026-12-02T00:00:00Z" },
      ],
      romiku_order_items: [],
    }),
  );
  const save = vi.spyOn(provider, "documentSave");
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
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
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("已由其他用户修改");
  expect(save).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("button", { name: "送货日期 qa" }))
    .toHaveTextContent("2026-12-01");
});

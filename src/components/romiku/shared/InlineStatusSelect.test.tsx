import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import fakeRestDataProvider from "ra-data-fakerest";
import { CoreAdminContext } from "ra-core";
import { InlineStatusSelect } from "./InlineStatusSelect";

it("updates the selected status inline and reports success", async () => {
  const provider = fakeRestDataProvider({
    romiku_quotes: [{ id: "q1", status: "draft" }],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <InlineStatusSelect
        resource="romiku_quotes"
        recordId="q1"
        status="draft"
        choices={[
          { value: "draft", label: "草稿" },
          { value: "sent", label: "已发送" },
        ]}
      />
    </CoreAdminContext>,
  );
  await screen.getByLabelText("状态 q1", { exact: true }).selectOptions("sent");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("状态已保存。");
  expect(
    (await provider.getOne("romiku_quotes", { id: "q1" })).data.status,
  ).toBe("sent");
});

it("shows the safe capacity error and retains cancelled status when restoration is blocked", async () => {
  const provider = fakeRestDataProvider({
    romiku_production_orders: [{ id: "p", status: "cancelled" }],
  });
  vi.spyOn(provider, "update").mockRejectedValue({
    body: {
      code: "P4201",
      message:
        "SUN5 的生产安排超过订单数量。订单数量：100；其他生产单已安排：80；本生产单：40；保存后累计：120；超出：20。请调整数量后重试。",
    },
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <InlineStatusSelect
        resource="romiku_production_orders"
        recordId="p"
        recordLabel="OD001-P02"
        status="cancelled"
        choices={[
          { value: "cancelled", label: "已取消" },
          { value: "pending", label: "待生产" },
        ]}
      />
    </CoreAdminContext>,
  );
  await screen
    .getByLabelText("状态 OD001-P02", { exact: true })
    .selectOptions("pending");
  await expect.element(screen.getByRole("alert")).toHaveTextContent("超出：20");
  await expect
    .element(screen.getByLabelText("状态 OD001-P02", { exact: true }))
    .toHaveValue("cancelled");
});

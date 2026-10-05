import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
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

it("refreshes its selected value when a cached list refetches a newer Production status", async () => {
  const provider = fakeRestDataProvider({
    romiku_production_orders: [{ id: "p", status: "pending" }],
  });
  function RefetchedRow() {
    const [status, setStatus] = useState("cancelled");
    return (
      <>
        <button onClick={() => setStatus("pending")}>
          Receive fresh status
        </button>
        <InlineStatusSelect
          resource="romiku_production_orders"
          recordId="p"
          status={status}
          choices={[
            { value: "cancelled", label: "已取消" },
            { value: "pending", label: "待生产" },
          ]}
        />
      </>
    );
  }
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <RefetchedRow />
    </CoreAdminContext>,
  );
  await screen
    .getByRole("button", { name: "Receive fresh status", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("状态 p", { exact: true }))
    .toHaveValue("pending");
  await screen
    .getByLabelText("状态 p", { exact: true })
    .selectOptions("cancelled");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("状态已保存");
  expect(
    (await provider.getOne("romiku_production_orders", { id: "p" })).data
      .status,
  ).toBe("cancelled");
});
it("invalidates Production detail, list and Order child caches after a status mutation", async () => {
  const provider = fakeRestDataProvider({
    romiku_production_orders: [{ id: "p", status: "pending" }],
  });
  const cache = new QueryClient();
  const detailKey = ["romiku_production_orders", "getOne", { id: "p" }];
  cache.setQueryData(detailKey, { id: "p", status: "pending" });
  const screen = await render(
    <CoreAdminContext dataProvider={provider} queryClient={cache}>
      <InlineStatusSelect
        resource="romiku_production_orders"
        recordId="p"
        status="pending"
        choices={[
          { value: "cancelled", label: "已取消" },
          { value: "pending", label: "待生产" },
        ]}
      />
    </CoreAdminContext>,
  );
  await screen
    .getByLabelText("状态 p", { exact: true })
    .selectOptions("cancelled");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("状态已保存");
  expect(cache.getQueryState(detailKey)?.isInvalidated).toBe(true);
});

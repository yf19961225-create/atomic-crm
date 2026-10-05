import { QueryClient } from "@tanstack/react-query";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes, Route } from "react-router";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { OrderProductionPanel } from "./OrderProductionPanel";
import { FulfillmentDetail } from "./FulfillmentPages";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const common = {
  schema_version: 2,
  initialized_at: "2026-10-05",
  source: { kind: "manual" },
  front_mark: { mode: "text", text: "云裳" },
  small_label: { mode: "text", text: "Made in China" },
  labeling_requirements: "四面贴",
  production_requirements: "外套编织袋",
};
const targets = ["P06", "P07"].map((id) => ({
  id,
  order_id: "o",
  document_number: `OD261004002-${id}`,
  status: "pending",
  marking_snapshot: {},
}));
async function setup(badRead = false) {
  rpc.mockReset();
  const order = {
    id: "o",
    document_number: "OD261004002",
    production_defaults_snapshot: common,
  };
  const provider = fakeRestDataProvider({
    romiku_orders: [order],
    romiku_production_orders: structuredClone(targets),
    romiku_production_items: [],
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  for (const p of targets)
    cache.setQueryData(["romiku_production_orders", "getOne", { id: p.id }], p);
  const read = vi.spyOn(provider, "getMany");
  rpc.mockImplementation(async (_name, args) => {
    if (args.expected) {
      for (const p of targets)
        if (!badRead || p.id !== "P07")
          await provider.update("romiku_production_orders", {
            id: p.id,
            previousData: p,
            data: { marking_snapshot: common },
          });
    }
    return {
      data: {
        ok: true,
        token: "v",
        productions: targets,
        source_snapshot: common,
        order_document_number: order.document_number,
        count: 2,
      },
      error: null,
    };
  });
  const screen = await render(
    <MemoryRouter initialEntries={["/order"]}>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <Routes>
          <Route
            path="/order"
            element={<OrderProductionPanel order={order} />}
          />
          <Route
            path="/production/:id"
            element={<FulfillmentDetail kind="production" />}
          />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("link", { name: "P06", exact: true }))
    .toBeVisible();
  return { screen, provider, cache, read };
}
it("shows saved source content and names, Cancel does not write", async () => {
  const { screen } = await setup();
  await screen
    .getByRole("button", { name: "将订单当前统一要求同步到未完成生产单" })
    .click();
  await expect
    .element(screen.getByRole("alertdialog"))
    .toHaveTextContent("云裳");
  await expect
    .element(screen.getByRole("alertdialog"))
    .toHaveTextContent("外套编织袋");
  await expect
    .element(screen.getByRole("alertdialog"))
    .toHaveTextContent("OD261004002-P07");
  await screen.getByRole("button", { name: "取消同步" }).click();
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("batch re-reads both persisted snapshots, replaces stale cache, and reopened details show latest common fields", async () => {
  const { screen, read, cache } = await setup();
  await screen
    .getByRole("button", { name: "将订单当前统一要求同步到未完成生产单" })
    .click();
  await screen.getByRole("button", { name: "确认同步", exact: true }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(
      "已将 OD261004002 的统一生产要求同步到 P06、P07；产品级特殊要求已保留。",
    );
  expect(read).toHaveBeenCalledWith("romiku_production_orders", {
    ids: ["P06", "P07"],
  });
  for (const id of ["P06", "P07"])
    expect(
      cache.getQueryData<{ marking_snapshot: unknown }>([
        "romiku_production_orders",
        "getOne",
        { id },
      ])?.marking_snapshot,
    ).toEqual(common);
  await screen.getByRole("link", { name: "P07", exact: true }).click();
  await expect
    .element(screen.getByText("订单要求：外套编织袋", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("贴标要求：四面贴", { exact: true }))
    .toBeVisible();
});
it("does not report success when RPC count is two but P07 re-read is still empty", async () => {
  const { screen } = await setup(true);
  await screen
    .getByRole("button", { name: "将订单当前统一要求同步到未完成生产单" })
    .click();
  await screen.getByRole("button", { name: "确认同步", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("P07");
  await expect.element(screen.getByRole("alert")).toHaveTextContent("核验");
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
});
it("empty effective source is blocked in confirmation even if server returns ok", async () => {
  const { screen } = await setup();
  rpc.mockResolvedValue({
    data: {
      ok: true,
      token: "v",
      productions: targets,
      source_snapshot: { front_mark: { mode: "none", text: "hidden text" } },
      order_document_number: "OD261004002",
    },
    error: null,
  });
  await screen
    .getByRole("button", { name: "将订单当前统一要求同步到未完成生产单" })
    .click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(
      "当前订单尚未设置统一生产要求，请先设置订单的生产要求 / 唛头与标签。",
    );
  await expect.element(screen.getByRole("alertdialog")).not.toBeInTheDocument();
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("does not report success when persisted re-read fails after commit", async () => {
  const { screen, read } = await setup();
  read.mockRejectedValue(new Error("network"));
  await screen
    .getByRole("button", { name: "将订单当前统一要求同步到未完成生产单" })
    .click();
  await screen.getByRole("button", { name: "确认同步", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("同步请求已提交");
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("未确认全部结果");
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
});

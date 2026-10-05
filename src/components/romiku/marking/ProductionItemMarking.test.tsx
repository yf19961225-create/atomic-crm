import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import { ProductionItemMarking } from "./ProductionItemMarking";
import { MarkingProfileEditor } from "./MarkingProfileEditor";
import fakeRestDataProvider from "ra-data-fakerest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
beforeEach(() => rpc.mockReset());
const common = {
  schema_version: 2,
  initialized_at: "2026-10-03",
  source: { kind: "order" },
  small_label: { mode: "text", text: "Made in China" },
};
const parent = { id: "p", marking_snapshot: common };
const item = {
  id: "i",
  sku: "SUN5",
  position: 1,
  marking_override: { mode: "inherit" },
};
it("previews append and replace, cancels without write, saves only the selected item override", async () => {
  rpc.mockResolvedValue({ data: 1, error: null });
  const changed = vi.fn().mockResolvedValue(undefined);
  const screen = await render(
    <CoreAdminContext>
      <ProductionItemMarking
        parent={parent}
        items={[item]}
        onChanged={changed}
      />
    </CoreAdminContext>,
  );
  await expect
    .element(
      screen.getByText(
        "附加标签、产品级贴标要求及内部备注仅保存在 CRM，未输出到 Production XLSX",
        {
          exact: true,
        },
      ),
    )
    .toBeVisible();
  await screen.getByLabelText("SUN5 标签操作").click();
  await screen
    .getByRole("button", { name: "标签 / 特殊要求", exact: true })
    .click();
  await screen.getByLabelText("标签继承模式").selectOptions("append");
  await screen.getByRole("button", { name: "添加标签", exact: true }).click();
  await screen.getByLabelText("标签 1文字").fill("Barcode");
  const form = screen.getByRole("form", { name: "编辑产品标签" });
  await expect
    .element(form.getByText("Made in China", { exact: true }))
    .toBeVisible();
  await expect
    .element(form.getByText("Barcode", { exact: true }).last())
    .toBeVisible();
  await screen.getByLabelText("标签继承模式").selectOptions("replace");
  await expect
    .element(form.getByText("Made in China", { exact: true }))
    .not.toBeInTheDocument();
  await form.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).not.toHaveBeenCalled();
  await screen
    .getByRole("button", { name: "标签 / 特殊要求", exact: true })
    .click();
  await screen.getByLabelText("标签继承模式").selectOptions("append");
  await screen.getByRole("button", { name: "添加标签", exact: true }).click();
  await screen.getByLabelText("标签 1文字").fill("Barcode");
  await screen.getByRole("button", { name: "保存产品标签" }).click();
  await expect.poll(() => rpc.mock.calls.length).toBe(1);
  expect(rpc).toHaveBeenCalledWith(
    "romiku_update_item_marking",
    expect.objectContaining({
      production_id: "p",
      item_ids: ["i"],
      action: "set",
      payload: expect.objectContaining({
        mode: "append",
        labels: [expect.objectContaining({ text: "Barcode" })],
      }),
    }),
  );
  await expect.poll(() => changed.mock.calls.length).toBe(1);
});
it("bulk reset requires confirmation and keeps failed edits visible", async () => {
  rpc.mockResolvedValue({
    error: { message: "private SQL error" },
    data: null,
  });
  const screen = await render(
    <CoreAdminContext>
      <ProductionItemMarking
        parent={parent}
        items={[item]}
        onChanged={async () => {}}
      />
    </CoreAdminContext>,
  );
  await screen.getByLabelText("选择标签产品 SUN5 1").click();
  await screen.getByRole("button", { name: "恢复所选产品为继承" }).click();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "恢复所选产品为继承" }).click();
  await screen.getByRole("button", { name: "确认批量修改" }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("标签修改未完成");
  await expect.element(screen.getByRole("alertdialog")).toBeVisible();
  expect(document.body.textContent).not.toContain("private SQL error");
});
it("reload is explicit, cancel does not call RPC, and saved empty Order metadata survives edits", async () => {
  rpc.mockResolvedValue({
    data: { ...common, small_label: { mode: "none", text: "" } },
    error: null,
  });
  const provider = fakeRestDataProvider({
    romiku_orders: [{ id: "o", production_defaults_snapshot: common }],
    romiku_production_orders: [parent],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <MarkingProfileEditor kind="production" record={parent} />
    </CoreAdminContext>,
  );
  await screen.getByText("唛头与标签", { exact: true }).click();
  await screen
    .getByRole("button", { name: "重新载入订单默认值", exact: true })
    .click();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).not.toHaveBeenCalled();
  await screen
    .getByRole("button", { name: "重新载入订单默认值", exact: true })
    .click();
  await screen.getByRole("button", { name: "确认重新载入" }).click();
  await expect.poll(() => rpc.mock.calls.length).toBe(1);
  expect(rpc).toHaveBeenCalledWith("romiku_reload_production_defaults", {
    production_id: "p",
  });
  await expect.element(screen.getByLabelText("小标签文字")).toHaveValue("");
  await screen.unmount();
  const order = await render(
    <CoreAdminContext dataProvider={provider}>
      <MarkingProfileEditor
        kind="order"
        record={{ id: "o", production_defaults_snapshot: common }}
      />
    </CoreAdminContext>,
  );
  await order.getByText("生产要求 / 唛头与标签", { exact: true }).click();
  await order.getByRole("button", { name: "清空小标签" }).click();
  await order
    .getByRole("button", { name: "保存生产要求 / 唛头与标签" })
    .click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_orders", { id: "o" })).data
          .production_defaults_snapshot.small_label.mode,
    )
    .toBe("none");
  const saved = (await provider.getOne("romiku_orders", { id: "o" })).data
    .production_defaults_snapshot;
  expect(saved.initialized_at).toBe("2026-10-03");
  expect(saved.schema_version).toBe(2);
});

it("does not carry a previous Production draft into another Production", async () => {
  const screen = await render(
    <CoreAdminContext>
      <MarkingProfileEditor kind="production" record={parent} />
    </CoreAdminContext>,
  );
  await screen.getByText("唛头与标签", { exact: true }).click();
  await screen.getByLabelText("小标签文字").fill("Unsaved P01 draft");
  await screen.rerender(
    <CoreAdminContext>
      <MarkingProfileEditor
        kind="production"
        record={{
          id: "p2",
          marking_snapshot: {
            ...common,
            small_label: { mode: "text", text: "P02 saved" },
          },
        }}
      />
    </CoreAdminContext>,
  );
  // A record change must discard only the old record's local draft.
  const summary = screen.getByText("唛头与标签", { exact: true });
  await summary.click();
  await expect
    .element(screen.getByLabelText("小标签文字"))
    .toHaveValue("P02 saved");
});

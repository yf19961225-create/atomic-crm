import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext, type DataProvider } from "ra-core";
import { AtomicSaveRecovery } from "./AtomicSaveRecovery";
import { saveDocumentAtomically } from "./atomicDocumentSave";
beforeEach(() => sessionStorage.clear());
it("reload recovery retries the exact persisted request without replacing a newer page draft", async () => {
  const intent = {
    kind: "packing" as const,
    documentId: "packing",
    expectedRevision: 0,
    header: { packing_at: "2026-11-11T01:00:00Z" },
    items: [{ id: "line-a", sku: "A", quantity: 2 }],
  };
  const result = {
    kind: "packing",
    document_id: "packing",
    revision: 1,
    header: { id: "packing" },
    items: intent.items,
  };
  const save = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValue(result);
  const lookup = vi.fn().mockResolvedValue(null);
  const provider = {
    documentActor: async () => "qa",
    documentSnapshot: vi.fn(),
    documentSave: save,
    documentSaveResult: lookup,
  } as unknown as DataProvider;
  await expect(saveDocumentAtomically(provider, intent)).rejects.toThrow(
    "尚未确认",
  );
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <input aria-label="current draft" defaultValue="newer B" />
      <AtomicSaveRecovery kind="packing" documentId="packing" creation />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "查询刷新前的保存结果" }).click();
  expect(save).toHaveBeenCalledTimes(1);
  await screen.getByRole("button", { name: "按刷新前的原内容重试" }).click();
  await expect
    .element(screen.getByText("原请求已保存成功。当前页面编辑内容未被替换。"))
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("link", { name: "放弃当前页面编辑并打开已保存单据" }),
    )
    .toHaveAttribute("href", "/#/packing-shipping/packing");
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  await expect
    .element(screen.getByLabelText("current draft"))
    .toHaveValue("newer B");
});

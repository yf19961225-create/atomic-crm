import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { AppUpdate } from "./AppUpdate";
import { useAppDraft } from "./drafts";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function Editor() {
  const [dirty, setDirty] = useState(false);
  useAppDraft(dirty);
  return (
    <>
      <input aria-label="draft" onChange={() => setDirty(true)} />
      <button onClick={() => setDirty(false)}>Cancel draft</button>
    </>
  );
}
it("detects another build without reloading and guards unsaved input until cancelled", async () => {
  const fetchVersion = vi.fn().mockResolvedValue("b".repeat(40)),
    refresh = vi.fn();
  const screen = await render(
    <>
      <AppUpdate
        currentBuild={"a".repeat(40)}
        fetchVersion={fetchVersion}
        refresh={refresh}
      />
      <Editor />
    </>,
  );
  await expect
    .element(screen.getByText("发现 CRM 新版本", { exact: true }))
    .toBeVisible();
  await screen.getByRole("textbox", { name: "draft" }).fill("do not lose");
  await expect
    .element(
      screen.getByText("发现新版本。当前有未保存内容，请保存或取消后再刷新。"),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "立即刷新" }))
    .not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Cancel draft" }).click();
  await screen.getByRole("button", { name: "立即刷新" }).click();
  expect(refresh).toHaveBeenCalledOnce();
});
it("checks visible tabs every 60 seconds and focus, never hidden tabs", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const visible = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const fetchVersion = vi.fn().mockResolvedValue("a".repeat(40));
  await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={fetchVersion}
      refresh={vi.fn()}
    />,
  );
  await expect.poll(() => fetchVersion.mock.calls.length).toBe(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetchVersion).toHaveBeenCalledTimes(2);
  visible.mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(180000);
  expect(fetchVersion).toHaveBeenCalledTimes(2);
  visible.mockReturnValue("visible");
  window.dispatchEvent(new Event("focus"));
  await expect.poll(() => fetchVersion.mock.calls.length).toBe(3);
});
it("does not announce a failed version request and turns chunk errors into one explicit prompt", async () => {
  const refresh = vi.fn();
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={async () => {
        throw new Error("offline");
      }}
      refresh={refresh}
    />,
  );
  await expect
    .element(screen.getByRole("status", { name: "CRM 版本更新" }))
    .not.toBeInTheDocument();
  const error = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(error);
  expect(error.defaultPrevented).toBe(true);
  await expect
    .element(screen.getByText("发现 CRM 新版本", { exact: true }))
    .toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
});
it("keeps the draft and offers retry after an update download fails", async () => {
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={async () => "b".repeat(40)}
      refresh={async () => {
        throw new Error("offline");
      }}
    />,
  );
  await screen.getByRole("button", { name: "立即刷新" }).click();
  await expect
    .element(screen.getByText("暂时无法加载新版本，请检查网络后重试。"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "立即刷新" }))
    .toBeEnabled();
});
it("protects the native customer archive form on an otherwise read-only Order", async () => {
  const { CoreAdminContext } = await import("ra-core");
  const { MemoryRouter } = await import("react-router");
  const { OrderCustomerArchive } = await import(
    "../customers/OrderCustomerArchive"
  );
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext>
        <AppUpdate
          currentBuild={"a".repeat(40)}
          fetchVersion={async () => "b".repeat(40)}
          refresh={vi.fn()}
        />
        <OrderCustomerArchive record={{ id: "qa-order" }} />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await screen.getByRole("button", { name: "客户归档", exact: true }).click();
  await screen
    .getByRole("combobox", { name: "归档客户方式" })
    .selectOptions("new");
  await screen
    .getByRole("textbox", { name: "新客户名称" })
    .fill("Unsaved archive customer");
  await expect
    .element(
      screen.getByText("发现新版本。当前有未保存内容，请保存或取消后再刷新。"),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "客户归档", exact: true }).click();
  // Collapsing preserves the actual choices, so their draft stays protected.
  await expect
    .element(
      screen.getByText("发现新版本。当前有未保存内容，请保存或取消后再刷新。"),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "客户归档", exact: true }).click();
  await screen
    .getByRole("combobox", { name: "归档客户方式" })
    .selectOptions("existing");
  await expect
    .element(screen.getByRole("button", { name: "立即刷新" }))
    .toBeVisible();
});

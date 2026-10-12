import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { AppUpdate } from "./AppUpdate";
import { AppUpdateError } from "./version";
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
  expect(refresh.mock.calls[0]?.[2]).toBe("b".repeat(40));
});
it("releases a temporary form draft before the first update click after navigation", async () => {
  function Page() {
    const [showForm, setShowForm] = useState(true);
    return (
      <>
        <AppUpdate
          currentBuild={"a".repeat(40)}
          fetchVersion={async () => "b".repeat(40)}
          refresh={refresh}
        />
        {showForm && <Editor />}
        <button onClick={() => setShowForm(false)}>Open workbench</button>
      </>
    );
  }
  const refresh = vi.fn();
  const screen = await render(<Page />);
  await screen.getByRole("textbox", { name: "draft" }).fill("login in progress");
  await expect
    .element(screen.getByRole("button", { name: "稍后刷新" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Open workbench" }).click();
  await screen.getByRole("button", { name: "立即刷新" }).click();
  await expect.poll(() => refresh.mock.calls.length).toBe(1);
  expect(refresh.mock.calls[0]?.[2]).toBe("b".repeat(40));
});
it("confirms the latest remote build when refresh is clicked", async () => {
  const fetchVersion = vi
    .fn()
    .mockResolvedValueOnce("b".repeat(40))
    .mockResolvedValueOnce("c".repeat(40));
  const refresh = vi.fn();
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={fetchVersion}
      refresh={refresh}
    />,
  );
  await screen.getByRole("button", { name: "立即刷新" }).click();
  await expect.poll(() => refresh.mock.calls.length).toBe(1);
  expect(fetchVersion).toHaveBeenCalledTimes(2);
  expect(refresh.mock.calls[0]?.[2]).toBe("c".repeat(40));
});
it("activates a waiting worker after the verified PWA shell has loaded", async () => {
  const originalUrl = window.location.href;
  const build = "b".repeat(40);
  window.history.replaceState(null, "", `/?__crm_update=${build}`);
  const postMessage = vi.fn();
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  const registration = new EventTarget() as ServiceWorkerRegistration;
  Object.defineProperty(registration, "waiting", {
    value: { postMessage },
  });
  registration.update = vi.fn(async () => {});
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    registration,
  );
  try {
    await render(
      <AppUpdate
        currentBuild={build}
        fetchVersion={async () => build}
        watchWorker={() => () => {}}
      />,
    );
    await expect.poll(() => postMessage.mock.calls.length).toBe(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  } finally {
    window.history.replaceState(null, "", originalUrl);
  }
});
it("activates a worker that finishes installing after the new PWA shell loads", async () => {
  const originalUrl = window.location.href;
  const build = "b".repeat(40);
  window.history.replaceState(null, "", `/?__crm_update=${build}`);
  const postMessage = vi.fn();
  const registration = new EventTarget() as ServiceWorkerRegistration;
  const installing = new EventTarget() as ServiceWorker;
  Object.defineProperty(registration, "installing", {
    value: installing,
  });
  Object.defineProperty(registration, "waiting", {
    value: null,
    configurable: true,
  });
  registration.update = vi.fn(async () => {});
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    registration,
  );
  try {
    await render(
      <AppUpdate
        currentBuild={build}
        fetchVersion={async () => build}
        watchWorker={() => () => {}}
      />,
    );
    await expect.poll(() => registration.update).toHaveBeenCalledOnce();
    Object.defineProperty(registration, "waiting", {
      value: { postMessage },
    });
    installing.dispatchEvent(new Event("statechange"));
    await expect.poll(() => postMessage.mock.calls.length).toBe(1);
  } finally {
    window.history.replaceState(null, "", originalUrl);
  }
});
it("does not navigate when the click-time version request fails", async () => {
  const fetchVersion = vi
    .fn()
    .mockResolvedValueOnce("b".repeat(40))
    .mockRejectedValueOnce(new Error("offline"));
  const refresh = vi.fn();
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={fetchVersion}
      refresh={refresh}
    />,
  );
  await screen.getByRole("button", { name: "立即刷新" }).click();
  await expect
    .element(screen.getByText("新版本暂时加载失败，请稍后重试。"))
    .toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
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
  const refresh = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={async () => "b".repeat(40)}
      refresh={refresh}
    />,
  );
  await screen.getByRole("button", { name: "立即刷新" }).click();
  await expect
    .element(screen.getByText("新版本暂时加载失败，请稍后重试。"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "重试" }))
    .toBeEnabled();
  await screen.getByRole("button", { name: "重试" }).click();
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("logs the exact update stage without exposing request details", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={async () => "b".repeat(40)}
      refresh={async () => {
        throw new AppUpdateError("install-timeout");
      }}
    />,
  );
  await screen.getByRole("button", { name: "立即刷新" }).click();
  expect(warning).toHaveBeenCalledWith(
    "[CRM update] failed at install-timeout",
  );
});
it("ignores a waiting worker when the page already matches the remote build", async () => {
  let workerUpdate: (() => void) | undefined;
  const screen = await render(
    <AppUpdate
      currentBuild={"a".repeat(40)}
      fetchVersion={async () => "a".repeat(40)}
      watchWorker={(callback) => {
        workerUpdate = callback;
        return () => {};
      }}
    />,
  );
  expect(workerUpdate).toBeTypeOf("function");
  workerUpdate?.();
  await expect
    .element(screen.getByRole("status", { name: "CRM 版本更新" }))
    .not.toBeInTheDocument();
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

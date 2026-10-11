import { afterEach, expect, it, vi } from "vitest";
import { fetchAppVersion, refreshApp } from "./version";
afterEach(() => vi.restoreAllMocks());
it("fetches an uncached exact Git build and rejects HTML/invalid metadata", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ build: "b".repeat(40) })));
  expect(await fetchAppVersion()).toBe("b".repeat(40));
  expect(fetch).toHaveBeenCalledWith(
    "/version.json",
    expect.objectContaining({ cache: "no-store" }),
  );
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ build: "Date.now()" })),
  );
  await expect(fetchAppVersion()).rejects.toThrow("版本信息无效");
});
it("never touches a worker when an unsaved draft blocks refresh", async () => {
  const get = vi.spyOn(navigator.serviceWorker, "getRegistration");
  await refreshApp(() => false);
  expect(get).not.toHaveBeenCalled();
});
it("activates waiting worker only on explicit refresh and rechecks drafts after controller change", async () => {
  let allowed = true;
  const message = vi.fn(() => {
    allowed = false;
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    update: async () => {},
    waiting: { postMessage: message },
  } as unknown as ServiceWorkerRegistration);
  await refreshApp(() => allowed);
  expect(message).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
});
it("keeps a worker waiting when a new draft appears while checking updates", async () => {
  let allowed = true;
  const message = vi.fn();
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    update: async () => {
      allowed = false;
    },
    waiting: { postMessage: message },
  } as unknown as ServiceWorkerRegistration);
  await refreshApp(() => allowed);
  expect(message).not.toHaveBeenCalled();
});

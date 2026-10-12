import { afterEach, expect, it, vi } from "vitest";
import { fetchAppVersion, refreshApp } from "./version";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
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
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  let allowed = true;
  const update = vi.fn();
  const message = vi.fn(() => {
    allowed = false;
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    update,
    waiting: { postMessage: message },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration);
  await refreshApp(() => allowed);
  expect(message).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(update).not.toHaveBeenCalled();
});
it("keeps a worker waiting when a new draft appears while checking updates", async () => {
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  let allowed = true;
  const message = vi.fn();
  const registration = {
    update: async () => {
      allowed = false;
      registration.waiting = { postMessage: message };
    },
    waiting: null as { postMessage: typeof message } | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    registration as unknown as ServiceWorkerRegistration,
  );
  await refreshApp(() => allowed);
  expect(message).not.toHaveBeenCalled();
});
it("waits for updatefound when the newer worker is not waiting yet", async () => {
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  const registration = new EventTarget() as ServiceWorkerRegistration;
  const installing = new EventTarget() as ServiceWorker;
  Object.defineProperty(installing, "state", {
    value: "installing",
    configurable: true,
  });
  Object.defineProperty(registration, "waiting", {
    value: null,
    configurable: true,
  });
  Object.defineProperty(registration, "installing", {
    value: null,
    configurable: true,
  });
  const message = vi.fn(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  registration.update = vi.fn(async () => {
    Object.defineProperty(registration, "installing", {
      value: installing,
      configurable: true,
    });
    registration.dispatchEvent(new Event("updatefound"));
    queueMicrotask(() => {
      Object.defineProperty(installing, "state", {
        value: "installed",
        configurable: true,
      });
      Object.defineProperty(registration, "waiting", {
        value: { postMessage: message },
        configurable: true,
      });
      registration.dispatchEvent(new Event("updatefound"));
      installing.dispatchEvent(new Event("statechange"));
    });
  });
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    registration,
  );
  await refreshApp(() => true, vi.fn());
  expect(message).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
});
it("uses a direct reload when there is no controlling service worker", async () => {
  const update = vi.fn();
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(null);
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    update,
    waiting: { postMessage: vi.fn() },
  } as unknown as ServiceWorkerRegistration);
  const reload = vi.fn();
  await refreshApp(() => true, reload);
  expect(update).not.toHaveBeenCalled();
  expect(reload).toHaveBeenCalledOnce();
});
it("exposes the failed update stage and leaves the page available for retry", async () => {
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    update: vi.fn().mockRejectedValue(new Error("offline")),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration);
  await expect(refreshApp(() => true, vi.fn())).rejects.toThrow(
    "service-worker-update",
  );
});
it("reloads through the network-first shell when update finds no waiting worker", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const active = { state: "activated" } as ServiceWorker;
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(
    active,
  );
  const registration = new EventTarget() as ServiceWorkerRegistration;
  Object.defineProperty(registration, "active", { value: active });
  registration.update = vi.fn(async () => {});
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    registration,
  );
  const reload = vi.fn();
  const refresh = refreshApp(() => true, reload);
  await vi.advanceTimersByTimeAsync(20000);
  await refresh;
  expect(registration.update).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});

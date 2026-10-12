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
it("uses network-first reload if an installing worker does not finish", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const active = { state: "activated" } as ServiceWorker;
  const installing = new EventTarget() as ServiceWorker;
  Object.defineProperty(installing, "state", { value: "installing" });
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(
    active,
  );
  const registration = new EventTarget() as ServiceWorkerRegistration;
  Object.defineProperty(registration, "active", { value: active });
  Object.defineProperty(registration, "installing", { value: installing });
  registration.update = vi.fn(async () => {});
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    registration,
  );
  const reload = vi.fn();
  const refresh = refreshApp(() => true, reload);
  await vi.advanceTimersByTimeAsync(3000);
  await refresh;
  expect(reload).toHaveBeenCalledOnce();
});
it("reloads the network-first shell when skipWaiting does not change the controller", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const active = { state: "activated" } as ServiceWorker;
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(
    active,
  );
  const message = vi.fn();
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    active,
    waiting: { postMessage: message },
  } as unknown as ServiceWorkerRegistration);
  const reload = vi.fn();
  const refresh = refreshApp(() => true, reload);
  await vi.advanceTimersByTimeAsync(15000);
  await refresh;
  expect(message).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(reload).toHaveBeenCalledOnce();
});

it("keeps a draft created while activation stalls before the fallback reload", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  let allowed = true;
  const message = vi.fn(() => {
    allowed = false;
  });
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    waiting: { postMessage: message },
  } as unknown as ServiceWorkerRegistration);
  const reload = vi.fn();
  const refresh = refreshApp(() => allowed, reload);
  await vi.advanceTimersByTimeAsync(2000);
  await refresh;
  expect(message).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(reload).not.toHaveBeenCalled();
});

it("checks the target HTML before navigating to a cache-unique app shell", async () => {
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(null);
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    undefined,
  );
  const target = "b".repeat(40);
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(`<html><head><meta name="crm-build" content="${target}"></head></html>`),
  );
  const navigate = vi.fn();
  await refreshApp(() => true, navigate, target);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`__crm_update=${target}`),
    expect.objectContaining({ cache: "no-store", redirect: "error" }),
  );
  expect(navigate).toHaveBeenCalledWith(
    expect.stringContaining(`__crm_update=${target}`),
  );
});

it("warms the PWA start URL with the verified shell before navigating", async () => {
  const target = "b".repeat(40);
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(null);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(`<meta name="crm-build" content="${target}">`),
  );
  const events: string[] = [];
  const put = vi.fn(async (_request: RequestInfo, _response: Response) => {
    events.push("cache root");
  });
  vi.spyOn(window.caches, "open").mockResolvedValue({ put } as unknown as Cache);
  await refreshApp(() => true, () => events.push("navigate"), target);
  expect(events).toEqual(["cache root", "navigate"]);
  expect(put.mock.calls[0]?.[0]).toBe("/");
  expect(await put.mock.calls[0]?.[1]?.text()).toContain(target);
});

it("waits for the target HTML instead of reloading an old shell", async () => {
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(null);
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    undefined,
  );
  const old = "a".repeat(40);
  const target = "b".repeat(40);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(`<meta name="crm-build" content="${old}">`),
    )
    .mockResolvedValueOnce(
      new Response(`<meta name="crm-build" content="${target}">`),
    );
  const navigate = vi.fn();
  await refreshApp(() => true, navigate, target);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledOnce();
});

it("keeps the current app open when target HTML cannot be fetched", async () => {
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue(null);
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue(
    undefined,
  );
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const navigate = vi.fn();
  await expect(
    refreshApp(() => true, navigate, "b".repeat(40)),
  ).rejects.toMatchObject({ stage: "shell-fetch" });
  expect(navigate).not.toHaveBeenCalled();
});

it("verifies the shell and navigates without waiting for worker activation", async () => {
  const target = "b".repeat(40);
  const events: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    events.push("shell verified");
    return new Response(`<meta name="crm-build" content="${target}">`);
  });
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    waiting: {
      postMessage: () => {
        events.push("skip waiting");
        navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
        expect(events).toContain("navigate");
      },
    },
  } as unknown as ServiceWorkerRegistration);
  await refreshApp(() => true, () => events.push("navigate"), target);
  expect(events).toEqual(["shell verified", "navigate"]);
});

it("starts the verified navigation before a waiting worker can replace the PWA page", async () => {
  const target = "b".repeat(40);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(`<meta name="crm-build" content="${target}">`),
  );
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  const events: string[] = [];
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    waiting: { postMessage: () => events.push("skip waiting") },
  } as unknown as ServiceWorkerRegistration);
  await refreshApp(() => true, () => events.push("navigate"), target);
  expect(events[0]).toBe("navigate");
});

it("keeps a draft created during shell verification before worker activation", async () => {
  const target = "b".repeat(40);
  let allowed = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    allowed = false;
    return new Response(`<meta name="crm-build" content="${target}">`);
  });
  vi.spyOn(navigator.serviceWorker, "controller", "get").mockReturnValue({
    state: "activated",
  } as ServiceWorker);
  const postMessage = vi.fn();
  vi.spyOn(navigator.serviceWorker, "getRegistration").mockResolvedValue({
    waiting: { postMessage },
  } as unknown as ServiceWorkerRegistration);
  const navigate = vi.fn();
  await refreshApp(() => allowed, navigate, target);
  expect(postMessage).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

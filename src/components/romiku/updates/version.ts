export async function fetchAppVersion(): Promise<string> {
  const response = await fetch("/version.json", {
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("无法检查版本");
  const value = await response.json();
  if (!/^[a-f0-9]{40}$/i.test(value.build)) throw new Error("版本信息无效");
  return value.build;
}

export function watchAppWorker(onUpdate: () => void) {
  let disposed = false;
  const cleanups: (() => void)[] = [];
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return () => {};
  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      if (disposed) return;
      const watch = () => {
        if (registration.waiting) onUpdate();
        const worker = registration.installing;
        if (!worker) return;
        const state = () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            onUpdate();
        };
        worker.addEventListener("statechange", state);
        cleanups.push(() => worker.removeEventListener("statechange", state));
      };
      registration.addEventListener("updatefound", watch);
      cleanups.push(() =>
        registration.removeEventListener("updatefound", watch),
      );
      watch();
    })
    .catch(() => {
      /* Version polling still works without a worker. */
    });
  return () => {
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
  };
}

export class AppUpdateError extends Error {
  constructor(
    public readonly stage: string,
    cause?: unknown,
  ) {
    super(`service-worker-${stage}`, { cause });
    this.name = "AppUpdateError";
  }
}

// Preview diagnostic only: retained across a worker-driven page replacement.
export function traceUpdate(stage: string, reset = false) {
  try {
    const previous = reset
      ? ""
      : window.sessionStorage.getItem("__crm_update_trace") ?? "";
    window.sessionStorage.setItem(
      "__crm_update_trace",
      `${previous}${previous ? " → " : ""}${stage}`.slice(-600),
    );
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

function waitForWorker(
  registration: ServiceWorkerRegistration,
  getInstalling: () => ServiceWorker | null,
) {
  let cancel = () => {};
  const ready = new Promise<ServiceWorker>((resolve, reject) => {
    let worker: ServiceWorker | null = null;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      registration.removeEventListener("updatefound", found);
      worker?.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve(worker!);
    };
    cancel = () => finish();
    const changed = () => {
      if (worker?.state === "installed" || worker?.state === "activated")
        finish();
      else if (worker?.state === "redundant")
        finish(new AppUpdateError("install"));
    };
    const found = () => {
      const installing = getInstalling();
      if (!installing || installing === worker) return;
      worker?.removeEventListener("statechange", changed);
      worker = installing;
      worker.addEventListener("statechange", changed);
      changed();
    };
    const timer = window.setTimeout(
      () => finish(new AppUpdateError("install-timeout")),
      20000,
    );
    registration.addEventListener("updatefound", found);
    found();
  });
  return { ready, cancel };
}

async function verifiedUpdateUrl(
  expectedBuild: string,
  canRefresh: () => boolean,
): Promise<string | undefined> {
  // Check the new shell before activating a worker: activation can replace
  // this page before its async continuation runs in an installed PWA.
  const target = new URL(window.location.href);
  target.searchParams.set("__crm_update", expectedBuild);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!canRefresh()) return;
    let response: Response;
    try {
      response = await fetch(target.pathname + target.search, {
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      throw new AppUpdateError("shell-fetch", error);
    }
    if (!response.ok) throw new AppUpdateError("shell-fetch");
    const html = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    if (
      html.querySelector<HTMLMetaElement>('meta[name="crm-build"]')?.content ===
      expectedBuild
    ) return target.href;
    if (attempt < 3)
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new AppUpdateError("shell-version");
}

/** Only called after explicit consent; never clear auth, preferences or caches. */
export async function refreshApp(
  canRefresh: () => boolean,
  reload: (url?: string) => void = (url) =>
    url ? window.location.assign(url) : window.location.reload(),
  expectedBuild = "",
) {
  if (!canRefresh()) return;
  const targetUrl = expectedBuild
    ? await verifiedUpdateUrl(expectedBuild, canRefresh)
    : undefined;
  traceUpdate(`shell:${targetUrl ? "ok" : "none"}`);
  if (expectedBuild && !targetUrl) return;
  let navigated = false;
  const navigate = () => {
    if (navigated || !canRefresh()) return;
    navigated = true;
    traceUpdate("navigate");
    reload(targetUrl);
  };
  // The verified shell is served network-first. Navigate before a waiting
  // worker can replace this document and cancel the PWA's first navigation.
  if (targetUrl) {
    navigate();
    return;
  }
  if ("serviceWorker" in navigator) {
    let registration: ServiceWorkerRegistration | undefined;
    try {
      registration = await navigator.serviceWorker.getRegistration("/");
      traceUpdate(`registration:${registration ? "yes" : "no"}`);
    } catch (error) {
      throw new AppUpdateError("registration", error);
    }
    const controller = navigator.serviceWorker.controller;
    if (registration && controller) {
      if (!registration.waiting) {
        traceUpdate("update:start");
        // Subscribe before update(): updatefound can fire while update() is pending.
        const installing = waitForWorker(
          registration,
          () => registration.installing,
        );
        void installing.ready.catch(() => {});
        try {
          await registration.update();
          traceUpdate("update:done");
        } catch (error) {
          installing.cancel();
          throw new AppUpdateError("update", error);
        }
        if (!registration.waiting && registration.installing) {
          // A new app shell remains available through the current worker's
          // network-first navigation route even if this install stalls.
          let graceTimer: number | undefined;
          try {
            await Promise.race([
              installing.ready,
              new Promise<void>((resolve) => {
                graceTimer = window.setTimeout(resolve, 2000);
              }),
            ]);
          } finally {
            clearTimeout(graceTimer);
            installing.cancel();
          }
        } else installing.cancel();
      }
      if (!canRefresh()) return;
      const waiting = registration.waiting;
      traceUpdate(`waiting:${waiting ? "yes" : "no"}`);
      if (waiting) {
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener(
              "controllerchange",
              changed,
            );
            if (error) reject(error);
            else resolve();
          };
          const changed = () => {
            traceUpdate("controllerchange");
            finish();
            if (targetUrl) navigate();
          };
          const timer = window.setTimeout(() => {
            traceUpdate("activation:timeout");
            finish();
            if (targetUrl) navigate();
          }, 2000);
          navigator.serviceWorker.addEventListener("controllerchange", changed);
          try {
            waiting.postMessage({ type: "SKIP_WAITING" });
          } catch (error) {
            finish(new AppUpdateError("activate", error));
          }
        });
      }
    }
  }
  navigate();
}

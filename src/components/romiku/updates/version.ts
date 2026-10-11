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

/** Only called after explicit consent; never clear auth, preferences or caches. */
export async function refreshApp(canRefresh: () => boolean) {
  if (!canRefresh()) return;
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) {
      await registration.update();
      const installing = registration.installing;
      if (installing)
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () => finish(new Error("更新尚未准备好，请重试。")),
            20000,
          );
          const finish = (error?: Error) => {
            clearTimeout(timer);
            installing.removeEventListener("statechange", state);
            if (error) reject(error);
            else resolve();
          };
          const state = () => {
            if (
              installing.state === "installed" ||
              installing.state === "activated"
            )
              finish();
            else if (installing.state === "redundant")
              finish(new Error("更新下载失败，请重试。"));
          };
          installing.addEventListener("statechange", state);
          state();
        });
      if (!canRefresh()) return;
      const waiting = registration.waiting;
      if (waiting)
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () => finish(new Error("更新尚未生效，请重试。")),
            15000,
          );
          const finish = (error?: Error) => {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener(
              "controllerchange",
              changed,
            );
            if (error) reject(error);
            else resolve();
          };
          const changed = () => finish();
          navigator.serviceWorker.addEventListener("controllerchange", changed);
          waiting.postMessage({ type: "SKIP_WAITING" });
        });
    }
  }
  if (canRefresh()) window.location.reload();
}

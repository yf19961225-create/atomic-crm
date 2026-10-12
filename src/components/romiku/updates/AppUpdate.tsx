import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hasAppDraft, useHasAppDraft } from "./drafts";
import {
  AppUpdateError,
  fetchAppVersion,
  refreshApp,
  watchAppWorker,
} from "./version";

export function AppUpdate({
  currentBuild = import.meta.env.VITE_APP_BUILD_SHA,
  fetchVersion = fetchAppVersion,
  refresh = refreshApp,
}: {
  currentBuild?: string;
  fetchVersion?: () => Promise<string>;
  refresh?: (canRefresh: () => boolean) => Promise<void> | void;
}) {
  const [available, setAvailable] = useState(false);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [remoteBuild, setRemoteBuild] = useState("");
  const dirty = useHasAppDraft();
  useEffect(() => {
    let disposed = false,
      pending = false;
    const announce = () => {
      if (!disposed) setAvailable(true);
    };
    const check = async () => {
      if (document.visibilityState !== "visible" || pending || !currentBuild)
        return;
      pending = true;
      try {
        const remote = await fetchVersion();
        if (remote !== currentBuild) {
          setRemoteBuild(remote);
          announce();
          if (import.meta.env.PROD && "serviceWorker" in navigator) {
            const registration =
              await navigator.serviceWorker.getRegistration("/");
            await registration?.update();
          }
        }
      } catch {
        /* A failed check is not evidence of a new build. */
      } finally {
        pending = false;
      }
    };
    const preload = (event: Event) => {
      event.preventDefault();
      announce();
    };
    const unwatch = watchAppWorker(announce);
    const timer = window.setInterval(() => void check(), 60000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("vite:preloadError", preload);
    void check();
    return () => {
      disposed = true;
      clearInterval(timer);
      unwatch();
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("vite:preloadError", preload);
    };
  }, [currentBuild, fetchVersion]);
  if (!available) return null;
  return (
    <aside
      role="status"
      aria-label="CRM 版本更新"
      className="fixed inset-x-2 top-2 z-[100] mx-auto max-w-2xl space-y-2 rounded border bg-background p-3 shadow-lg"
      data-current-build={currentBuild}
      data-remote-build={remoteBuild}
    >
      <p>
        {dirty
          ? "发现新版本。当前有未保存内容，请保存或取消后再刷新。"
          : "发现 CRM 新版本"}
      </p>
      {!dirty && (
        <p className="text-sm text-muted-foreground">
          刷新后可使用最新功能和数据更新逻辑。
        </p>
      )}
      {failure && <p role="alert">{failure}</p>}
      {dirty ? (
        <Button
          variant="outline"
          onClick={() => setLater(true)}
          disabled={later}
        >
          {later ? "已保留当前编辑" : "稍后刷新"}
        </Button>
      ) : (
        <Button
          disabled={busy}
          onClick={async () => {
            if (hasAppDraft()) return;
            setBusy(true);
            setFailure("");
            try {
              await refresh(() => !hasAppDraft());
            } catch (error) {
              const stage =
                error instanceof AppUpdateError ? error.stage : "unknown";
              console.warn(`[CRM update] failed at ${stage}`);
              setFailure("新版本暂时加载失败，请稍后重试。");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在准备更新…" : failure ? "重试" : "立即刷新"}
        </Button>
      )}
    </aside>
  );
}

import { useEffect, type RefObject } from "react";
import { useBlocker, useCanBlock } from "ra-core";
import { Button } from "@/components/ui/button";
export function ProductionNavigationGuard({
  active,
  busy,
  committed,
}: {
  active: boolean;
  busy: boolean;
  committed: RefObject<boolean>;
}) {
  const canBlock = useCanBlock();
  useEffect(() => {
    if (!active) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (committed.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (canBlock || committed.current) return;
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (anchor && (busy || !window.confirm("放弃尚未保存的生产单修改？"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [active, busy, canBlock, committed]);
  return canBlock ? (
    <RouterGuard active={active} busy={busy} committed={committed} />
  ) : null;
}
function RouterGuard({
  active,
  busy,
  committed,
}: {
  active: boolean;
  busy: boolean;
  committed: RefObject<boolean>;
}) {
  const blocker = useBlocker(() => active && !committed.current);
  if (blocker.state !== "blocked") return null;
  return (
    <div
      role="alertdialog"
      aria-label="尚有未保存的生产单修改"
      className="fixed inset-x-4 top-1/3 z-50 mx-auto max-w-lg space-y-4 rounded border bg-background p-6 shadow-xl"
    >
      <p>
        {busy
          ? "正在保存或上传图片，请等待完成后离开。"
          : "尚有未保存的生产单修改，是否放弃并离开？"}
      </p>
      <Button onClick={() => blocker.reset?.()}>继续编辑</Button>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => blocker.proceed?.()}
      >
        放弃修改并离开
      </Button>
    </div>
  );
}

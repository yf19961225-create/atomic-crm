import { useLayoutEffect, useRef, type ReactNode } from "react";

export const documentSafeRollback =
  import.meta.env.VITE_DOCUMENT_SAFE_ROLLBACK === "1";

export function assertDocumentWritesEnabled(enabled = documentSafeRollback) {
  if (enabled)
    throw new Error(
      "当前为单据只读回退版本，保存及转换已暂停。请保留草稿并等待恢复新版。",
    );
}

// Read controls are explicitly marked at their owning page. All other native
// form controls remain disabled, including controls inserted after data loads.
function ReadOnlyDocument({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current!;
    const changed = new Map<HTMLInputElement, boolean>();
    const disable = () => {
      node
        .querySelectorAll<HTMLInputElement>("button,input,select,textarea")
        .forEach((control) => {
          if (control.closest('[data-document-read-control], [role="tab"]'))
            return;
          if (!changed.has(control)) changed.set(control, control.disabled);
          if (!control.disabled) control.disabled = true;
        });
    };
    disable();
    const observer = new MutationObserver(disable);
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    return () => {
      observer.disconnect();
      changed.forEach((disabled, control) => {
        control.disabled = disabled;
      });
    };
  }, []);
  return (
    <div ref={root} className="min-w-0">
      {children}
    </div>
  );
}

export function DocumentRollbackBoundary({
  children,
  pathname,
  enabled = documentSafeRollback,
}: {
  children: ReactNode;
  pathname: string;
  enabled?: boolean;
}) {
  if (!enabled) return children;
  const documentPage =
    /^\/(quotes|pi|orders|packing-shipping|romiku_quotes|romiku_pis|romiku_orders|romiku_packing_lists)(\/|$)/.test(
      pathname,
    );
  return (
    <>
      <p
        role="status"
        className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm"
      >
        单据只读回退模式：报价单、PI、订单和装箱单暂停编辑及转换，已保存数据仍可查看。数据库版本及幂等保护保持启用。
      </p>
      {documentPage ? (
        <ReadOnlyDocument key={pathname}>{children}</ReadOnlyDocument>
      ) : (
        children
      )}
    </>
  );
}

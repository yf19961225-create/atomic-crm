import { useEffect, useState } from "react";
import { useDataProvider } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  pendingDocumentIntent,
  resolveDocumentSave,
  retryPendingDocumentSave,
  finishDocumentCreation,
  type AtomicDocumentKind,
  type DocumentSnapshot,
} from "./atomicDocumentSave";

/** A reloaded page never silently submits or replaces its current draft. */
export function AtomicSaveRecovery({
  kind,
  documentId,
  creation = false,
}: {
  kind: AtomicDocumentKind;
  documentId: string;
  creation?: boolean;
}) {
  const provider = useDataProvider();
  const [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [result, setResult] = useState<DocumentSnapshot | null>(null);
  useEffect(() => {
    let live = true;
    void pendingDocumentIntent(provider, kind, documentId)
      .then((intent) => {
        if (live) setPending(!!intent);
      })
      .catch(() => {
        if (live) setMessage("无法读取原保存请求，请保留编辑内容后重试。");
      });
    return () => {
      live = false;
    };
  }, [provider, kind, documentId]);
  if (!pending && !message) return null;
  async function check(retry: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const saved = retry
        ? await retryPendingDocumentSave(provider, kind, documentId)
        : await resolveDocumentSave(provider, kind, documentId);
      setResult(saved);
      setMessage(
        saved
          ? "原请求已保存成功。当前页面编辑内容未被替换。"
          : "尚未查询到已提交结果。可按原内容重试，不要另建重复单据。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法确认保存结果。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside role="status" className="rounded border p-3 space-y-2">
      <p>
        {message ||
          "检测到刷新前尚未确认的保存请求。请先查询原结果；当前编辑内容会保留。"}
      </p>
      {!result && (
        <div className="flex flex-wrap gap-2">
          <Button
            data-document-read-control
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void check(false)}
          >
            查询刷新前的保存结果
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void check(true)}
          >
            按刷新前的原内容重试
          </Button>
        </div>
      )}
      {result && (
        <Button asChild variant="outline">
          <a
            href={`/#/${{ quote: "quotes", pi: "pi", order: "orders", packing: "packing-shipping" }[kind]}/${encodeURIComponent(result.document_id)}`}
            onClick={(event) => {
              if (
                new URL(event.currentTarget.href).href === window.location.href
              ) {
                event.preventDefault();
                window.location.reload();
              }
              if (creation) finishDocumentCreation(kind, documentId);
            }}
          >
            放弃当前页面编辑并打开已保存单据
          </a>
        </Button>
      )}
    </aside>
  );
}

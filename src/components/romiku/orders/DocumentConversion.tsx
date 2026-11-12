import { resolveDocumentSource } from "../commercial/atomicDocumentSave";
import { useRef, useState } from "react";
import { useDataProvider } from "ra-core";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  convertDocument,
  documentConfig,
  type DocumentKind,
} from "./documentWorkflow";

export function DocumentConversion({
  source,
  sourceId,
  expectedSourceRevision,
}: {
  source: "quote" | "pi";
  sourceId: string;
  expectedSourceRevision: number;
}) {
  const provider = useDataProvider();
  const pending = useRef(false);
  const sourceRevision = useRef(expectedSourceRevision);
  const [target, setTarget] = useState<DocumentKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const navigate = useNavigate();
  async function convert() {
    if (!target || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure("");
    try {
      const id = await convertDocument(
        provider,
        source,
        sourceId,
        target,
        sourceRevision.current,
      );
      navigate(`${documentConfig[target].path}/${id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex gap-3">
        {(source === "quote" ? ["pi", "order"] : ["order"]).map((kind) => (
          <Button
            key={kind}
            variant="outline"
            onClick={() => {
              setFailure("");
              sourceRevision.current = expectedSourceRevision;
              setTarget(kind as DocumentKind);
            }}
          >
            创建{documentConfig[kind as DocumentKind].label}
          </Button>
        ))}
      </div>
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              创建{target && documentConfig[target].label}
            </DialogTitle>
            <DialogDescription>
              将已保存的采购方、产品、价格和商务条款复制到独立单据中。未保存的
              修改不会包含在内，来源单据保持不变。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button disabled={busy} onClick={convert}>
              {busy
                ? "创建中…"
                : `确认并创建${target && documentConfig[target].label}`}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              取消
            </Button>
          </div>
          {failure && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!target || pending.current) return;
                pending.current = true;
                setBusy(true);
                try {
                  const result = await resolveDocumentSource(provider, {
                    sourceKind: source,
                    sourceId,
                    targetKind: target,
                    expectedSourceRevision: sourceRevision.current,
                  });
                  if (result)
                    navigate(
                      `${documentConfig[target].path}/${result.document_id}`,
                    );
                  else setFailure("尚未查询到转换结果，请保留当前选择。");
                } catch (cause) {
                  setFailure(errorMessage(cause));
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              查询创建结果
            </Button>
          )}
          {failure && <p role="alert">{failure}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

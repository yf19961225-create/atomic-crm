import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  convertDocument,
  documentConfig,
  type DocumentKind,
} from "./documentWorkflow";

export function DocumentConversion({
  source,
  sourceId,
}: {
  source: "quote" | "pi";
  sourceId: string;
}) {
  const [target, setTarget] = useState<DocumentKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const navigate = useNavigate();
  async function convert() {
    if (!target || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const id = await convertDocument(
        getSupabaseClient(),
        source,
        sourceId,
        target,
      );
      navigate(`${documentConfig[target].path}/${id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
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
              setTarget(kind as DocumentKind);
            }}
          >
            Create {documentConfig[kind as DocumentKind].label}
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
              Create {target && documentConfig[target].label}
            </DialogTitle>
            <DialogDescription>
              Copy the saved buyer, products, prices and commercial terms into
              an independent document. Unsaved edits are excluded. The source
              remains unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button disabled={busy} onClick={convert}>
              {busy
                ? "Creating…"
                : `Confirm and create ${target && documentConfig[target].label}`}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Cancel
            </Button>
          </div>
          {failure && <p role="alert">{failure}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

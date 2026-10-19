import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export function SupplierDeleteButton() {
  const record = useRecordContext<{ id: string; name: string }>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const inFlight = useRef(false);
  const cache = useQueryClient();
  if (!record) return null;

  async function remove() {
    if (!record || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "romiku_delete_supplier",
        { record_id: String(record.id) },
      );
      if (error || !data || typeof data.ok !== "boolean") {
        setFailure("删除失败，请刷新后重试。");
      } else if (!data.ok) {
        setFailure(
          typeof data.message === "string"
            ? data.message
            : "删除失败，请刷新后重试。",
        );
      } else {
        setOpen(false);
        await cache.invalidateQueries();
      }
    } catch {
      setFailure("删除失败，请刷新后重试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        aria-label={`删除供应商 ${record.name}`}
        onClick={() => {
          setFailure("");
          setOpen(true);
        }}
      >
        删除供应商
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!inFlight.current) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除供应商 {record.name}？</DialogTitle>
            <DialogDescription>
              确定删除该供应商吗？系统会检查产品关联、生产单、联系人和手动任务；存在任何关联时不会删除。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          {failure && (
            <p role="alert" className="text-destructive">
              {failure}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "正在删除…" : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

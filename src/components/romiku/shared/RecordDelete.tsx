import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

type DeleteKind =
  | "quote"
  | "pi"
  | "order"
  | "packing"
  | "production"
  | "outbound"
  | "manual_task";
const descriptions: Record<DeleteKind, string> = {
  quote:
    "将永久删除报价单、产品行及版本。已有 PI 或订单时无法删除；关联任务会保留。",
  pi: "将永久删除 PI 及产品行。已有订单时无法删除；来源报价单与关联任务会保留。",
  order:
    "将永久删除订单及产品行。已有生产单、装箱单或收款时无法删除；来源报价单、PI 与关联任务会保留。",
  production:
    "将永久删除生产单及自己的产品行，来源订单与订单产品行会保留，关联手动任务会保留并解除关联。已有生产跟进时无法删除。",
  packing:
    "将永久删除装箱单及产品行，来源订单与订单产品行会保留，并恢复可装箱数量。",
  outbound:
    "将永久删除开发记录、联系人、跟进与来源网址。正式客户、询盘、报价单、PI、订单和任务会保留并解除关联。",
  manual_task: "将永久删除此手动任务，关联来源记录会保留。",
};
export function RecordDelete({
  kind,
  id,
  label,
  onDeleted,
  redirectTo,
  disabled = false,
}: {
  kind: DeleteKind;
  id: string;
  label: string;
  onDeleted?: () => void;
  redirectTo?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const inFlight = useRef(false);
  const cache = useQueryClient();
  const navigate = useNavigate();
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "romiku_delete_record",
        { kind, record_id: id },
      );
      if (error || !data || typeof data.ok !== "boolean") {
        setFailure("删除失败，请刷新后重试。");
        return;
      }
      if (!data.ok) {
        setFailure(
          typeof data.message === "string"
            ? data.message
            : "删除失败，请刷新后重试。",
        );
        return;
      }
      setOpen(false);
      onDeleted?.();
      if (redirectTo) navigate(redirectTo, { replace: true });
      // Includes totals, remaining quantities, calendar, action center and linked records.
      await cache.invalidateQueries();
    } catch {
      setFailure("删除失败，请刷新后重试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`更多操作 ${label}`}
            disabled={disabled || busy}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setFailure("");
              setOpen(true);
            }}
          >
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!inFlight.current) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 {label}？</DialogTitle>
            <DialogDescription>
              {descriptions[kind]}此操作无法撤销。
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

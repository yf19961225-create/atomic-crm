import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { workflowRpc } from "./BulkActions";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export function LifecycleDialog({
  kind,
  id,
  label,
  onClose,
  onDone,
}: {
  kind: "payment" | "order" | "archive";
  id: string;
  label: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  const deps = useQuery({
    queryKey: ["order-void-preflight", id],
    enabled: kind === "order",
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "romiku_order_delete_preflight",
        { ids: [id] },
      );
      if (error || !data?.ok) throw new Error("检查失败");
      return [...data.deletable, ...data.blocked][0] as {
        production_count: number;
        packing_count: number;
        cascade_productions: { document_number: string; status: string }[];
      };
    },
  });
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await workflowRpc(
        kind === "payment"
          ? "romiku_void_payment"
          : kind === "order"
            ? "romiku_void_order"
            : "romiku_archive_orders",
        kind === "archive"
          ? { ids: [id] }
          : kind === "payment"
            ? { payment_id: id, reason }
            : { order_id: id, reason },
      );
      if (
        kind === "archive" &&
        (result.failed?.length || !result.succeeded?.some((r) => r.id === id))
      )
        throw new Error(
          result.failed?.[0]?.message || "归档失败，请刷新后重试。",
        );
      onDone?.();
      await cache.invalidateQueries();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === "archive"
              ? "归档"
              : kind === "payment"
                ? "作废收款"
                : "作废订单"}{" "}
            {label}？
          </DialogTitle>
          <DialogDescription>
            {kind === "payment"
              ? "作废后不再计入有效已收金额，原收款和作废审计记录永久保留，不能普通恢复。"
              : kind === "order"
                ? "订单及其产品、收款、生产单、装箱单与来源历史全部保留。作废不会自动取消生产或装箱，请另行确认后续安排。"
                : "归档只隐藏默认列表中的订单，历史、搜索和 Customer 360 仍可查看。"}
          </DialogDescription>
        </DialogHeader>
        {kind === "order" &&
          (deps.isPending ? (
            <p>正在检查关联业务…</p>
          ) : deps.error ? (
            <p role="alert">
              无法检查关联业务。
              <Button onClick={() => deps.refetch()}>重试</Button>
            </p>
          ) : (
            <div>
              <p>
                关联生产单 {deps.data?.production_count || 0} 张，装箱单{" "}
                {deps.data?.packing_count || 0} 张。
              </p>
              {deps.data?.cascade_productions
                .filter((p) => !["received", "cancelled"].includes(p.status))
                .map((p) => (
                  <p key={p.document_number}>
                    注意：{p.document_number} 尚未完成，将继续保留。
                  </p>
                ))}
            </div>
          ))}
        {kind !== "archive" && (
          <label>
            作废原因（必填）
            <textarea
              className="mt-2 w-full rounded border p-2"
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={
              busy ||
              (kind !== "archive" && !reason.trim()) ||
              (kind === "order" && (deps.isPending || !!deps.error))
            }
            onClick={() => void submit()}
          >
            {busy ? "正在处理…" : kind === "archive" ? "确认归档" : "确认作废"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

type OrderCheck = {
  order_id: string;
  document_number: string;
  delete_mode: "order_only" | "cascade_production" | "blocked";
  production_count: number;
  packing_count: number;
  payment_count: number;
  cascade_productions: {
    id: string;
    document_number: string;
    status_label: string;
  }[];
  blocked_reasons: string[];
};
type Preflight = { ok: true; deletable: OrderCheck[]; blocked: OrderCheck[] };
type Outcome = {
  order_id: string;
  document_number: string;
  status?: string;
  message?: string;
};
type Report = { deleted: Outcome[]; failed: Outcome[] };

/** Both single and bulk UI use the same server policy. Mount only while open. */
export function OrderDeleteDialog({
  ids,
  label,
  batch = false,
  onClose,
  onDeleted,
  redirectTo,
}: {
  ids: string[];
  label?: string;
  batch?: boolean;
  onClose: () => void;
  onDeleted?: () => void;
  redirectTo?: string;
}) {
  const [preflight, setPreflight] = useState<Preflight>();
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report>();
  const inFlight = useRef(false);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const idsKey = JSON.stringify(ids);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await getSupabaseClient().rpc(
          "romiku_order_delete_preflight",
          { ids: JSON.parse(idsKey) },
        );
        if (!active) return;
        if (
          error ||
          !data?.ok ||
          !Array.isArray(data.deletable) ||
          !Array.isArray(data.blocked)
        ) {
          setFailure("无法检查删除条件，请关闭后重试。");
          return;
        }
        setPreflight(data);
      } catch {
        if (active) setFailure("无法检查删除条件，请关闭后重试。");
      }
    })();
    return () => {
      active = false;
    };
  }, [idsKey]);
  async function remove() {
    if (!preflight?.deletable.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      let result: Report;
      if (batch) {
        const { data, error } = await getSupabaseClient().rpc(
          "romiku_batch_delete_orders",
          { ids: preflight.deletable.map((row) => row.order_id) },
        );
        if (
          error ||
          !data?.ok ||
          !Array.isArray(data.deleted) ||
          !Array.isArray(data.failed)
        )
          throw new Error("delete request failed");
        result = data;
      } else {
        const row = preflight.deletable[0];
        const { data, error } = await getSupabaseClient().rpc(
          "romiku_delete_record",
          { kind: "order", record_id: row.order_id },
        );
        if (error || typeof data?.ok !== "boolean")
          throw new Error("delete request failed");
        const outcome = {
          order_id: row.order_id,
          document_number: row.document_number,
          message: data.message,
          status:
            data.code === "HAS_DOWNSTREAM" ? "blocked_at_execution" : "failed",
        };
        result = data.ok
          ? { deleted: [outcome], failed: [] }
          : { deleted: [], failed: [outcome] };
      }
      setReport({
        deleted: result.deleted,
        failed: [
          ...preflight.blocked.map((row) => ({
            order_id: row.order_id,
            document_number: row.document_number,
            message: row.blocked_reasons.join(" "),
          })),
          ...result.failed,
        ],
      });
      // Clear selection on completion, including a batch where every execution was blocked.
      onDeleted?.();
      // Totals/search/Customer 360/source navigation all read the same database state.
      await cache.invalidateQueries();
      if (!batch && result.deleted.length) {
        onClose();
        if (redirectTo) navigate(redirectTo, { replace: true });
      }
    } catch {
      // A transport failure can occur after commit. Refresh rather than claiming rollback.
      setFailure("未能确认删除结果，请关闭并刷新后检查，勿重复提交。");
      onDeleted?.();
      await cache.invalidateQueries();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const blockedOnly = !!preflight && !preflight.deletable.length;
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !inFlight.current) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {report
              ? "订单删除结果"
              : batch
                ? "批量删除订单"
                : blockedOnly
                  ? `无法删除 ${label}`
                  : `删除 ${label}？`}
          </DialogTitle>
          <DialogDescription>
            {report
              ? "已根据执行时的最新依赖重新检查。"
              : "仅可删除无装箱、无收款，且所有生产单均未归档、无跟进、状态为待生产或已取消的订单。此操作无法撤销。"}
          </DialogDescription>
        </DialogHeader>
        {!preflight && !failure && <p role="status">正在检查删除条件…</p>}
        {failure && (
          <p role="alert" className="text-destructive">
            {failure}
          </p>
        )}
        {report ? (
          <div className="space-y-3">
            <p>
              删除成功 {report.deleted.length} 张；未删除 {report.failed.length}{" "}
              张
            </p>
            {report.deleted.map((row) => (
              <p key={row.order_id}>{row.document_number} · 已删除</p>
            ))}
            {report.failed.map((row) => (
              <p key={row.order_id}>
                {row.document_number} ·{" "}
                {row.status === "blocked_at_execution"
                  ? "执行时新增依赖或状态变化，已阻止删除。"
                  : "未删除。"}
                {row.message || "请刷新后重试。"}
              </p>
            ))}
          </div>
        ) : (
          preflight && (
            <div className="space-y-4">
              {batch && <p>已选择：{ids.length} 张</p>}
              {!!preflight.deletable.length && (
                <div className="space-y-3">
                  <h3 className="font-medium">
                    可删除：{preflight.deletable.length} 张
                  </h3>
                  {preflight.deletable.map((row) => (
                    <div key={row.order_id} className="rounded border p-3">
                      <p className="font-medium">{row.document_number}</p>
                      {row.cascade_productions.length ? (
                        <>
                          <p>将同时删除：</p>
                          <ul className="ml-5 list-disc">
                            {row.cascade_productions.map((child) => (
                              <li key={child.id}>
                                {child.document_number} · {child.status_label}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p>无下游执行记录</p>
                      )}
                    </div>
                  ))}
                  <p className="text-sm text-muted-foreground">
                    来源
                    Quote、PI、正式客户和手动任务将保留；任务仅解除关联，编号不回收。
                  </p>
                </div>
              )}
              {!!preflight.blocked.length && (
                <div className="space-y-3">
                  <h3 className="font-medium">
                    无法删除：{preflight.blocked.length} 张
                  </h3>
                  {preflight.blocked.map((row) => (
                    <div key={row.order_id} className="rounded border p-3">
                      <p className="font-medium">{row.document_number}</p>
                      <ul className="ml-5 list-disc">
                        {row.blocked_reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {report || blockedOnly || failure ? "关闭" : "取消"}
          </Button>
          {!report && !failure && !!preflight?.deletable.length && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy
                ? "正在删除…"
                : batch
                  ? `删除 ${preflight.deletable.length} 张可删除订单`
                  : "删除订单及未执行生产单"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

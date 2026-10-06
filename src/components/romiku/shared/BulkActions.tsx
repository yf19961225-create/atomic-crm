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
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { statusOptions, type WorkflowResource } from "./workflowStatus";
import { OrderDeleteDialog } from "../orders/OrderDeleteDialog";
type Row = { id: string; label: string; reasons?: string[]; message?: string };
type Result = {
  ok: boolean;
  message?: string;
  deletable?: Row[];
  blocked?: Row[];
  succeeded?: Row[];
  failed?: Row[];
};
export async function workflowRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<Result> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error || !data || typeof data.ok !== "boolean")
    throw new Error("操作失败，请刷新后重试。");
  if (!data.ok) throw new Error(data.message || "操作失败，请刷新后重试。");
  return data;
}
export function BulkActions({
  kind,
  ids,
  onDone,
  disabled = false,
}: {
  kind: WorkflowResource;
  ids: string[];
  onDone: () => void;
  disabled?: boolean;
}) {
  const [action, setAction] = useState<{
    type: "delete" | "status" | "archive";
    ids: string[];
  } | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const cache = useQueryClient();
  const preflight = useQuery({
    queryKey: ["bulk-delete-preflight", kind, action?.ids],
    queryFn: () =>
      workflowRpc("romiku_delete_preflight", { kind, ids: action!.ids }),
    enabled: action?.type === "delete" && kind !== "order" && !result,
    staleTime: 0,
    gcTime: 0,
  });
  const open = (type: "delete" | "status" | "archive") => {
    setFailure("");
    setResult(null);
    setTarget("");
    setAction({ type, ids: [...ids] });
  };
  async function execute() {
    if (!action || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      const selected =
        action.type === "delete"
          ? (preflight.data?.deletable || []).map((r) => r.id)
          : action.ids;
      const response = await workflowRpc(
        action.type === "delete"
          ? "romiku_batch_delete"
          : action.type === "status"
            ? "romiku_batch_status"
            : "romiku_archive_orders",
        action.type === "archive"
          ? { ids: selected }
          : {
              kind,
              ids: selected,
              ...(action.type === "status" ? { target_status: target } : {}),
            },
      );
      setResult({
        ...response,
        blocked: action.type === "delete" ? preflight.data?.blocked : [],
      });
      onDone();
      await cache.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "bulk-delete-preflight",
      });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "操作失败，请刷新后重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {ids.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded border p-3"
          aria-label="批量操作"
        >
          <span>已选择 {ids.length} 条（当前页）</span>
          {kind !== "order" && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => open("status")}
            >
              批量修改状态
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={() => open("delete")}
          >
            批量删除
          </Button>
          {kind === "order" && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => open("archive")}
            >
              批量归档
            </Button>
          )}
          <Button variant="outline" onClick={onDone}>
            取消选择
          </Button>
        </div>
      )}
      {action?.type === "delete" && kind === "order" ? (
        <OrderDeleteDialog
          ids={action.ids}
          batch
          onClose={() => setAction(null)}
          onDeleted={onDone}
        />
      ) : (
        <Dialog
          open={!!action}
          onOpenChange={(v) => {
            if (!busy && !v) setAction(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                {action?.type === "delete"
                  ? "批量删除"
                  : action?.type === "archive"
                    ? "批量归档"
                    : "批量修改状态"}
              </DialogTitle>
              <DialogDescription>
                已选择 {action?.ids.length} 条记录。
                {action?.type === "delete"
                  ? "仅删除检查通过的记录，执行时会再次检查依赖。此操作无法撤销。"
                  : action?.type === "archive"
                    ? "归档后从默认订单列表隐藏，历史和搜索仍可查看。"
                    : "每条记录分别验证并保存，失败记录保持原状态。"}
              </DialogDescription>
            </DialogHeader>
            {result ? (
              <div role="status">
                <p>
                  成功 {result.succeeded?.length || 0} 条；失败{" "}
                  {result.failed?.length || 0} 条。
                </p>
                {!!result.blocked?.length && (
                  <>
                    <p>预检阻止 {result.blocked.length} 条：</p>
                    {result.blocked.map((r) => (
                      <p key={r.id}>
                        {r.label}：{r.reasons?.join(" ")}
                      </p>
                    ))}
                  </>
                )}
                {result.failed?.map((r) => (
                  <p key={r.id}>
                    {r.label}：{r.message}
                  </p>
                ))}
              </div>
            ) : (
              <>
                {action?.type === "status" && (
                  <label>
                    目标状态
                    <select
                      className="block rounded border p-2"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">请选择状态</option>
                      {statusOptions(kind).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {action?.type === "delete" &&
                  (preflight.isPending ? (
                    <p>正在检查删除依赖…</p>
                  ) : preflight.error ? (
                    <p role="alert">
                      无法检查删除依赖。
                      <Button onClick={() => preflight.refetch()}>重试</Button>
                    </p>
                  ) : (
                    <>
                      <p>
                        可以删除：{preflight.data?.deletable?.length || 0} 条
                      </p>
                      {preflight.data?.deletable?.map((r) => (
                        <p key={r.id}>{r.label}</p>
                      ))}
                      <p>无法删除：{preflight.data?.blocked?.length || 0} 条</p>
                      {preflight.data?.blocked?.map((r) => (
                        <p key={r.id}>
                          {r.label}：{r.reasons?.join(" ")}
                        </p>
                      ))}
                    </>
                  ))}
              </>
            )}
            {failure && <p role="alert">{failure}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {result ? "关闭" : "取消"}
              </Button>
              {!result && (
                <Button
                  disabled={
                    busy ||
                    (action?.type === "status" && !target) ||
                    (action?.type === "delete" &&
                      (!preflight.data?.deletable?.length ||
                        !!preflight.error ||
                        preflight.isFetching))
                  }
                  variant={
                    action?.type === "delete" ? "destructive" : "default"
                  }
                  onClick={() => void execute()}
                >
                  {busy
                    ? "正在处理…"
                    : action?.type === "delete"
                      ? "确认删除可删除记录"
                      : action?.type === "archive"
                        ? "确认归档"
                        : "确认修改"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

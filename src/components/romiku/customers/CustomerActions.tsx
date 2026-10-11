import { useRef, useState } from "react";
import type { RaRecord } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { workflowRpc } from "../shared/BulkActions";

type Row = {
  id: string;
  label: string;
  dependencies?: Record<string, number>;
  reasons?: string[];
  message?: string;
};
type Result = {
  ok: boolean;
  deletable?: Row[];
  blocked?: Row[];
  succeeded?: Row[];
  failed?: Row[];
};
const dependencyLabels: Record<string, string> = {
  quotes: "报价单",
  pi: "PI",
  orders: "订单",
  website_inquiries: "网站询盘",
  manual_tasks: "手动任务",
  outbound: "关联 Outbound 来源",
  production: "生产单",
  packing: "装箱单",
  payments: "收款记录",
};
export function CustomerActions({
  ids,
  record,
  onDone,
  onView,
  onEdit,
  disabled = false,
}: {
  ids: string[];
  record?: RaRecord;
  onDone: () => void;
  onView?: () => void;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  const [action, setAction] = useState<{
    type: "delete" | "active" | "inactive";
    ids: string[];
  } | null>(null);
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const cache = useQueryClient();
  const preflight = useQuery({
    queryKey: ["customer-delete-preflight", action?.ids],
    queryFn: async () =>
      (await workflowRpc("romiku_delete_preflight", {
        kind: "formal_customer",
        ids: action!.ids,
      })) as Result,
    enabled: action?.type === "delete" && !result,
    staleTime: 0,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const open = (type: "delete" | "active" | "inactive") => {
    setError("");
    setResult(null);
    setAction({ type, ids: [...ids] });
  };
  const close = () => {
    if (busy) return;
    setAction(null);
    if (result) onDone();
  };
  async function execute() {
    if (!action || lock.current) return;
    const selected =
      action.type === "delete"
        ? (preflight.data?.deletable || []).map((r) => r.id)
        : action.ids;
    if (!selected.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = (await workflowRpc(
        action.type === "delete"
          ? "romiku_batch_delete"
          : "romiku_batch_status",
        {
          kind: "formal_customer",
          ids: selected,
          ...(action.type !== "delete" ? { target_status: action.type } : {}),
        },
      )) as Result;
      setResult(data);
      await cache.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "customer-delete-preflight",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const blocked = preflight.data?.blocked || [],
    eligible = preflight.data?.deletable || [];
  return (
    <>
      {record ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`客户操作 ${record.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onView}>查看</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>编辑</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                open(record.status === "inactive" ? "active" : "inactive")
              }
            >
              {record.status === "inactive" ? "启用" : "停用"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("delete")}>
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : ids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded border p-3">
          <span>已选择 {ids.length} 个客户</span>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => open("active")}
          >
            批量启用
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => open("inactive")}
          >
            批量停用
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => open("delete")}
          >
            批量删除
          </Button>
          <Button variant="ghost" onClick={onDone}>
            取消选择
          </Button>
        </div>
      ) : null}
      <Dialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {action?.type === "delete"
                ? record
                  ? `${blocked.length && !eligible.length ? "无法删除" : "删除"} “${record.name}”`
                  : "批量删除客户"
                : `${action?.type === "inactive" ? "停用" : "启用"}客户`}
            </DialogTitle>
            <DialogDescription>
              {action?.type === "delete"
                ? "永久删除前由服务器检查所有业务历史；执行时会再次检查。"
                : "只修改客户启用状态，历史单据、Customer 360、联系人和唛头资料均保留。"}
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <>
              <p role="status">
                成功 {result.succeeded?.length || 0} 个，失败{" "}
                {result.failed?.length || 0} 个
              </p>
              {result.failed?.map((r) => (
                <p key={r.id} role="alert">
                  {r.label}：{r.message || "操作失败，请刷新后重试。"}
                </p>
              ))}
              <Button onClick={close}>关闭</Button>
            </>
          ) : (
            <>
              {action?.type === "delete" && (
                <>
                  {preflight.isPending && <p>正在检查业务依赖…</p>}
                  {preflight.error && (
                    <p role="alert">无法检查删除条件，请关闭后重试。</p>
                  )}
                  {!!eligible.length && (
                    <div>
                      <p>可删除：{eligible.map((r) => r.label).join("、")}</p>
                      <p>该客户没有关联的正式业务记录。</p>
                      <p>
                        将永久删除客户档案、客户联系人及客户内部附属资料。此操作无法撤销。
                      </p>
                    </div>
                  )}
                  {blocked.map((r) => (
                    <div key={r.id} className="rounded border p-3">
                      <strong>无法删除 {r.label}</strong>
                      {Object.entries(r.dependencies || {})
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => (
                          <p key={k}>
                            {dependencyLabels[k] || "其他业务引用"}：{n}
                          </p>
                        ))}
                      {r.reasons?.map((reason) => (
                        <p key={reason}>{reason}</p>
                      ))}
                      <p>为保护历史业务和 Customer 360，请使用停用客户。</p>
                    </div>
                  ))}
                </>
              )}
              {error && <p role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy} onClick={close}>
                  {blocked.length && !eligible.length ? "关闭" : "取消"}
                </Button>
                {action?.type === "delete" ? (
                  <>
                    {!!eligible.length &&
                      !preflight.isFetching &&
                      !preflight.error && (
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={execute}
                        >
                          {busy
                            ? "正在删除…"
                            : record
                              ? "永久删除客户"
                              : `删除 ${eligible.length} 个可删除客户`}
                        </Button>
                      )}
                    {record &&
                      blocked.length > 0 &&
                      record.status !== "inactive" && (
                        <Button
                          disabled={busy}
                          onClick={() => open("inactive")}
                        >
                          停用客户
                        </Button>
                      )}
                  </>
                ) : (
                  <Button disabled={busy} onClick={execute}>
                    {busy
                      ? "正在保存…"
                      : action?.type === "inactive"
                        ? "确认停用"
                        : "确认启用"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

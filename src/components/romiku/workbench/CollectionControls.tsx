import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RomikuDatePicker } from "../shared/RomikuDatePicker";
import {
  workbenchRpc,
  refreshWorkbench,
  type CollectionSnapshot,
} from "./workbenchApi";
export const confirmationLabels: Record<string, string> = {
  unknown: "待核实",
  unconfirmed: "客户未确认",
  confirmed: "客户已确认",
};
export function CollectionControls({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const query = useQuery({
    queryKey: ["workbench-collection", orderId],
    queryFn: () =>
      workbenchRpc<CollectionSnapshot>("romiku_workbench_order_snapshot", {
        p_order: orderId,
      }),
    enabled: false,
    refetchOnWindowFocus: true,
  });
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={opening}
        onClick={async () => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpening(true);
          setOpen(true);
          try {
            await query.refetch();
          } finally {
            setOpening(false);
          }
        }}
      >
        管理收款阶段
      </Button>
      {open && (
        <div
          className="my-3 rounded border p-4"
          role="region"
          aria-label="收款阶段管理"
        >
          {opening || query.isPending ? (
            <p>正在读取收款依据…</p>
          ) : query.error ? (
            <p role="alert">
              {query.error.message}
              <Button onClick={() => query.refetch()}>重试</Button>
            </p>
          ) : (
            <CollectionForm
              orderId={orderId}
              snapshot={query.data}
              onClose={() => setOpen(false)}
              onReload={() => {
                setOpen(false);
                void query.refetch();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
function CollectionForm({
  orderId,
  snapshot,
  onClose,
  onReload,
}: {
  orderId: string;
  snapshot: CollectionSnapshot;
  onClose: () => void;
  onReload: () => void;
}) {
  const [base] = useState(snapshot); // expected revision/fingerprint stay attached to this user's draft
  const [action, setAction] = useState("customer_confirmation"),
    [status, setStatus] = useState(base.state.customer_confirmation),
    [reason, setReason] = useState(""),
    [follow, setFollow] = useState(!!base.state.needs_follow_up),
    [date, setDate] = useState(base.state.next_follow_up_on || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    request = useRef<{ key: string; id: string } | null>(null),
    cache = useQueryClient();
  const received = base.payments.reduce((n, p) => n + Number(p.amount), 0),
    expected =
      Math.round(
        Number(base.amounts.total) * Number(base.amounts.deposit_percent),
      ) / 100;
  const eligible =
    base.state.customer_confirmation === "confirmed" &&
    !["draft", "cancelled", "voided"].includes(base.amounts.status) &&
    !base.amounts.archived_at &&
    base.amounts.deposit_percent > 0 &&
    base.amounts.deposit_percent < 100 &&
    base.amounts.deposit_remaining > 0 &&
    received > 0;
  const submit = async () => {
    if (pending.current || !reason.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const payload =
      action === "customer_confirmation"
        ? { state: status }
        : action === "deposit_accept"
          ? { fingerprint: base.fingerprint }
          : action === "collection_follow_up"
            ? { needs_follow_up: follow, next_follow_up_on: date }
            : {};
    const args = {
      p_action: action,
      p_id: orderId,
      p_revision: base.state.revision,
      p_payload: payload,
      p_reason: reason.trim(),
    };
    const key = JSON.stringify(args);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      await workbenchRpc("romiku_workbench_action", {
        ...args,
        p_request: request.current.id,
      });
      await refreshWorkbench(cache);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p>客户确认：{confirmationLabels[base.state.customer_confirmation]}</p>
      <p>计划定金：{expected.toFixed(2)}</p>
      <p>实际已收定金：{received.toFixed(2)}</p>
      <p>
        定金差额：{Math.max(expected - received, 0).toFixed(2)} · 总未收：
        {Number(base.amounts.remaining).toFixed(2)}
      </p>
      <p className="text-sm text-muted-foreground">
        确认定金阶段完成不是减免。差额保留在尾款中，不修改实际收款与订单总额。
      </p>
      <p>
        人工定金状态：
        {
          (
            {
              none: "未确认",
              accepted: "已确认完成",
              invalidated: "依据变化，已失效",
              revoked: "已撤销",
            } as Record<string, string>
          )[base.state.deposit_override]
        }
      </p>
      <label className="block">
        操作
        <select
          aria-label="操作"
          value={action}
          disabled={busy}
          onChange={(e) => setAction(e.target.value)}
          className="ml-2 rounded border p-2"
        >
          <option value="customer_confirmation">设置客户确认状态</option>
          {eligible && base.state.deposit_override !== "accepted" && (
            <option value="deposit_accept">确认定金阶段完成</option>
          )}
          {base.state.deposit_override === "accepted" && (
            <option value="deposit_revoke">撤销定金确认</option>
          )}
          <option value="collection_follow_up">设置收款跟进</option>
        </select>
      </label>
      {action === "customer_confirmation" && (
        <label>
          客户确认状态
          <select
            aria-label="客户确认状态"
            value={status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.entries(confirmationLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {action === "collection_follow_up" && (
        <>
          <label>
            <input
              type="checkbox"
              checked={follow}
              disabled={busy}
              onChange={(e) => setFollow(e.target.checked)}
            />
            需要跟进收款
          </label>
          <RomikuDatePicker
            label="下次收款跟进日期"
            value={date}
            onChange={setDate}
            disabled={busy}
          />
        </>
      )}
      <label className="block">
        操作原因
        <input
          aria-label="操作原因"
          value={reason}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          className="ml-2 max-w-full rounded border p-2"
        />
      </label>
      {error && (
        <p role="alert">
          {error}
          <Button type="button" onClick={onReload}>
            放弃本次输入并刷新
          </Button>
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={busy || !reason.trim()}
        >
          确认操作
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onClose}
        >
          取消
        </Button>
      </div>
    </div>
  );
}

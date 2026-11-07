import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RomikuDatePicker } from "../shared/RomikuDatePicker";
import { businessDate } from "./businessWindow";
import {
  workbenchRpc,
  refreshWorkbench,
  type DueSnapshot,
} from "./workbenchApi";
export const dueLabels: Record<string, string> = {
  unclassified: "待分类",
  needs_confirmation: "需要确认交期",
  confirmed: "已确认交期",
  not_required: "无需设置交期",
};
const dateOf = (snapshot: DueSnapshot) =>
  snapshot.factory_due_at
    ? businessDate(new Date(snapshot.factory_due_at))
    : null;
export function ProductionDueControls({
  productionId,
  onCancel,
}: {
  productionId: string;
  onCancel?: () => void;
}) {
  const query = useQuery({
    queryKey: ["workbench-due", productionId],
    queryFn: () =>
      workbenchRpc<DueSnapshot>("romiku_workbench_due_snapshot", {
        p_id: productionId,
      }),
  });
  if (!query.data)
    return (
      <div>
        {query.error ? (
          <p role="alert">
            {query.error.message}
            <Button onClick={() => query.refetch()}>重试</Button>
          </p>
        ) : (
          <p role="status">正在读取交期…</p>
        )}
        {onCancel && <Button onClick={onCancel}>取消</Button>}
      </div>
    );
  return (
    <DueForm
      key={productionId}
      snapshot={query.data}
      reload={async () => {
        const r = await query.refetch();
        if (r.error) throw r.error;
        return r.data!;
      }}
      onCancel={onCancel}
    />
  );
}
function DueForm({
  snapshot,
  reload,
  onCancel,
}: {
  snapshot: DueSnapshot;
  reload: () => Promise<DueSnapshot>;
  onCancel?: () => void;
}) {
  const [base, setBase] = useState(snapshot);
  const [date, setDate] = useState(dateOf(snapshot));
  const [classification, setClass] = useState(snapshot.classification);
  const [follow, setFollow] = useState(snapshot.needs_follow_up);
  const [followDate, setFollowDate] = useState(snapshot.next_follow_up_on);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<
    "date" | "clear" | "settings" | null
  >(null);
  const cache = useQueryClient(),
    pending = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const dirty =
    date !== dateOf(base) ||
    classification !== base.classification ||
    follow !== base.needs_follow_up ||
    followDate !== base.next_follow_up_on;
  function accept(next: DueSnapshot) {
    setBase(next);
    setDate(dateOf(next));
    setClass(next.classification);
    setFollow(next.needs_follow_up);
    setFollowDate(next.next_follow_up_on);
  }
  useEffect(() => {
    // Refresh clean forms, but never silently rebase a user's pending revision.
    if (!dirty && !busy && !error && snapshot.revision !== base.revision) {
      setBase(snapshot);
      setDate(dateOf(snapshot));
      setClass(snapshot.classification);
      setFollow(snapshot.needs_follow_up);
      setFollowDate(snapshot.next_follow_up_on);
    }
  }, [snapshot, base.revision, dirty, busy, error]);
  async function submit(
    intent: "date" | "clear" | "settings",
    acknowledged = false,
  ) {
    if (pending.current) return;
    if (intent === "date" && !date) return;
    if (
      !acknowledged &&
      (intent === "clear" ||
        (intent === "date" && base.classification === "not_required") ||
        (intent === "settings" &&
          classification === "not_required" &&
          base.factory_due_at))
    ) {
      setConfirmation(intent);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const args = {
      p_action: "production_due",
      p_id: base.id,
      p_revision: base.revision,
      p_payload: {
        classification:
          intent === "date"
            ? "confirmed"
            : intent === "clear"
              ? base.classification === "not_required"
                ? "not_required"
                : "needs_confirmation"
              : classification,
        date_mode:
          intent === "date" ? "set" : intent === "clear" ? "clear" : "keep",
        date: intent === "date" ? date : null,
        ack_retained_date: acknowledged,
        needs_follow_up: intent === "settings" ? follow : base.needs_follow_up,
        next_follow_up_on:
          intent === "settings" ? followDate : base.next_follow_up_on,
      },
      p_reason:
        note.trim() ||
        (intent === "date"
          ? "调整工厂交期"
          : intent === "clear"
            ? "清除工厂交期"
            : "调整工厂交期管理设置"),
    };
    const key = JSON.stringify(args);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      await workbenchRpc("romiku_workbench_action", {
        ...args,
        p_request: request.current.id,
      });
      // The successful write is followed by an authoritative snapshot; refresh failures
      // keep the same idempotency key rather than submitting a second mutation.
      await refreshWorkbench(cache);
      accept(await reload());
      setConfirmation(null);
      setNote("");
      setMessage(intent === "settings" ? "设置已保存" : "日期已保存");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={`工厂交期 ${base.document_number}`}
      className="min-w-0 space-y-2 text-sm"
    >
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 basis-40">
          工厂交货日期
          <RomikuDatePicker
            label="工厂交货日期"
            value={date}
            onChange={(v) => {
              setDate(v);
              setMessage("");
              setConfirmation(null);
            }}
            disabled={busy}
          />
        </label>
        <Button
          type="button"
          disabled={
            busy ||
            !date ||
            (date === dateOf(base) && base.classification === "confirmed")
          }
          onClick={() => submit("date")}
        >
          {busy ? "保存中…" : "保存日期"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {dueLabels[base.classification]} · 已保存日期：{dateOf(base) || "—"}
        {dirty && (
          <span className="ml-2 font-medium text-foreground">未保存</span>
        )}
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <div role="alert">
          <p>{error} 输入已保留，请读取最新版本后再次确认。</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              try {
                await refreshWorkbench(cache);
                setBase(await reload());
                setError("");
                setConfirmation(null);
                setMessage("已读取最新版本，输入保留，请核对后保存。");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            读取最新版本，保留输入
          </Button>
        </div>
      )}
      {confirmation && (
        <div
          role="alertdialog"
          aria-label="确认交期变更"
          className="rounded border p-2"
        >
          <p>
            {confirmation === "clear"
              ? "确认清除已保存日期？生产单将按原规则转为需要确认交期（无需交期分类保持）。"
              : confirmation === "date"
                ? "此生产单原为无需设置交期，保存后将改为已确认交期。"
                : "确认保留日期但不生成交期催办？"}
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => submit(confirmation, true)}
          >
            {confirmation === "clear"
              ? "确认清除日期"
              : confirmation === "date"
                ? "确认设置交期"
                : "确认无需交期"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmation(null)}
          >
            返回修改
          </Button>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          更多设置
        </summary>
        <div className="mt-2 space-y-2 rounded border p-3">
          <label className="block">
            交期分类{" "}
            <select
              aria-label="交期分类"
              className="max-w-full rounded border p-1"
              value={classification}
              disabled={busy}
              onChange={(e) => {
                setClass(e.target.value);
                setConfirmation(null);
              }}
            >
              {Object.entries(dueLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={follow}
              disabled={busy}
              onChange={(e) => setFollow(e.target.checked)}
            />{" "}
            需要跟进交期
          </label>
          <RomikuDatePicker
            label="下次交期跟进日期"
            value={followDate}
            onChange={setFollowDate}
            disabled={busy}
          />
          <label className="block">
            备注（可选）
            <input
              aria-label="交期备注"
              className="w-full min-w-0 rounded border p-2"
              value={note}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={
              busy || (classification === "confirmed" && !base.factory_due_at)
            }
            onClick={() => submit("settings")}
          >
            保存更多设置
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !base.factory_due_at}
            onClick={() => submit("clear")}
          >
            清除已保存日期
          </Button>
        </div>
      </details>
    </section>
  );
}

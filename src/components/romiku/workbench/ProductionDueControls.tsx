import { useRef, useState } from "react";
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
export function ProductionDueControls({
  productionId,
}: {
  productionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const query = useQuery({
    queryKey: ["workbench-due", productionId],
    queryFn: () =>
      workbenchRpc<DueSnapshot>("romiku_workbench_due_snapshot", {
        p_id: productionId,
      }),
    enabled: false,
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
        管理工厂交期
      </Button>
      {open && (
        <div className="my-3 rounded border p-3">
          {opening || query.isPending ? (
            <p>正在读取交期…</p>
          ) : query.error ? (
            <p role="alert">{query.error.message}</p>
          ) : (
            <DueForm snapshot={query.data} close={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}
function DueForm({
  snapshot,
  close,
}: {
  snapshot: DueSnapshot;
  close: () => void;
}) {
  const [base] = useState(snapshot),
    [classification, setClass] = useState(snapshot.classification),
    [mode, setMode] = useState("keep"),
    [date, setDate] = useState<string | null>(
      snapshot.factory_due_at
        ? businessDate(new Date(snapshot.factory_due_at))
        : null,
    ),
    [ack, setAck] = useState(false),
    [follow, setFollow] = useState(snapshot.needs_follow_up),
    [followDate, setFollowDate] = useState(snapshot.next_follow_up_on),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cache = useQueryClient(),
    pending = useRef(false),
    request = useRef<{ key: string; id: string } | null>(null);
  async function submit() {
    if (pending.current || !reason.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const args = {
      p_action: "production_due",
      p_id: base.id,
      p_revision: base.revision,
      p_payload: {
        classification,
        date_mode: mode,
        date,
        ack_retained_date: ack,
        needs_follow_up: follow,
        next_follow_up_on: followDate,
      },
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
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p>
        {base.document_number} · 当前交期{" "}
        {base.factory_due_at
          ? businessDate(new Date(base.factory_due_at))
          : "—"}
      </p>
      <label className="block">
        交期分类
        <select
          aria-label="交期分类"
          value={classification}
          disabled={busy}
          onChange={(e) => setClass(e.target.value)}
        >
          {Object.entries(dueLabels).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        日期操作
        <select
          aria-label="日期操作"
          value={mode}
          disabled={busy}
          onChange={(e) => {
            setMode(e.target.value);
            if (e.target.value === "clear" && classification === "confirmed")
              setClass("needs_confirmation");
          }}
        >
          <option value="keep">保留原日期</option>
          <option value="set">设置交期</option>
          <option value="clear">清空交期</option>
        </select>
      </label>
      {mode === "set" && (
        <RomikuDatePicker
          label="工厂交期"
          value={date}
          onChange={setDate}
          disabled={busy}
        />
      )}
      {classification === "not_required" &&
        (mode === "set" || (mode === "keep" && base.factory_due_at)) && (
          <label className="block">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={busy}
            />
            确认保留日期但不生成交期催办
          </label>
        )}
      <label className="block">
        <input
          type="checkbox"
          checked={follow}
          onChange={(e) => setFollow(e.target.checked)}
          disabled={busy}
        />
        需要跟进交期
      </label>
      <RomikuDatePicker
        label="下次交期跟进日期"
        value={followDate}
        onChange={setFollowDate}
        disabled={busy}
      />
      <label className="block">
        交期操作原因
        <input
          aria-label="交期操作原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          disabled={busy}
          className="max-w-full rounded border p-2"
        />
      </label>
      {error && <p role="alert">{error} 请取消后重新打开以读取最新版本。</p>}
      <Button
        type="button"
        onClick={submit}
        disabled={busy || !reason.trim() || (mode === "set" && !date)}
      >
        保存交期管理
      </Button>
      <Button type="button" variant="outline" onClick={close} disabled={busy}>
        取消
      </Button>
    </div>
  );
}

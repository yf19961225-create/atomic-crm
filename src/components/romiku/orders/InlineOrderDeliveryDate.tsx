import { saveDocumentHeaderPatch } from "../commercial/atomicDocumentSave";
import { useEffect, useRef, useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RomikuDatePicker } from "../shared/RomikuDatePicker";
import {
  orderDeliveryDateLabel,
  localBusinessDateTime,
  resolveBusinessDateTime,
} from "../shared/businessDate";
const dayOf = (value: unknown) => {
  const day = orderDeliveryDateLabel(value);
  return day === "—" ? null : day;
};

/** Same authenticated update path as the order editor; never sends a full totals-view row. */
export function InlineOrderDeliveryDate({ record }: { record: RaRecord }) {
  const provider = useDataProvider();
  const cache = useQueryClient();
  const [saved, setSaved] = useState(dayOf(record.expected_delivery_at));
  const [date, setDate] = useState(saved);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const dirty = date !== saved;
  const observed = useRef(record.expected_delivery_at);
  useEffect(() => {
    if (
      !dirty &&
      !busy &&
      !error &&
      observed.current !== record.expected_delivery_at
    ) {
      observed.current = record.expected_delivery_at;
      const next = dayOf(record.expected_delivery_at);
      setSaved(next);
      setDate(next);
    }
  }, [record.expected_delivery_at, dirty, busy, error]);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const previous = String(record.expected_delivery_at || "");
      const time =
        localBusinessDateTime(previous, "Asia/Shanghai").slice(11) || "00:00";
      const options = date
        ? resolveBusinessDateTime(date, time, previous, "Asia/Shanghai")
        : [null];
      if (options.length !== 1)
        throw new Error("日期或时间不唯一，请在订单详情确认后保存。");
      const result = await saveDocumentHeaderPatch(provider, "order", record, {
        expected_delivery_at: options[0],
      });
      const next = dayOf(result.header.expected_delivery_at);
      setSaved(next);
      setDate(next);
      await cache.invalidateQueries();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "日期保存失败，请重试。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (record.archived_at || record.status === "voided")
    return <span>{saved || "—"}</span>;
  return (
    <div className="min-w-36 max-w-64 whitespace-normal">
      <RomikuDatePicker
        timeZone="Asia/Shanghai"
        label="订单送货日期"
        buttonLabel={`送货日期 ${record.document_number || record.id}`}
        value={date}
        onChange={setDate}
        disabled={busy}
      />
      {(dirty || error) && (
        <div className="mt-1 flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存日期"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDate(saved);
              setError("");
            }}
          >
            取消
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error} 输入已保留。
        </p>
      )}
    </div>
  );
}

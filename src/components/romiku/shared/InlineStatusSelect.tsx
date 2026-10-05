import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDataProvider } from "ra-core";

export type InlineStatusChoice = { value: string; label: string };

export function InlineStatusSelect({
  resource,
  recordId,
  recordLabel,
  status,
  choices,
  label = "状态",
  onUpdated,
}: {
  resource: string;
  recordId: string;
  recordLabel?: string;
  status: string;
  choices: InlineStatusChoice[];
  label?: string;
  onUpdated?: (status: string) => void;
}) {
  const provider = useDataProvider();
  const cache = useQueryClient();
  const [value, setValue] = useState(status);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(status), [status]);
  const change = async (next: string) => {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await provider.update(resource, {
        id: recordId,
        data: { status: next },
        previousData: { id: recordId, status: previous },
      });
      if (resource === "romiku_production_orders")
        await cache.invalidateQueries();
      onUpdated?.(next);
      setMessage("状态已保存。");
    } catch (error) {
      setValue(previous);
      setFailed(true);
      const problem = error as {
        code?: string;
        message?: string;
        body?: { code?: string; message?: string };
      };
      const capacity =
        resource === "romiku_production_orders" &&
        (problem?.body?.code || problem?.code) === "P4201";
      setMessage(
        capacity
          ? problem.body?.message ||
              problem.message ||
              "生产安排超过订单数量，请调整数量后重试。"
          : "状态保存失败，已恢复原状态。",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`${label} ${recordLabel || recordId}`}
        className="rounded border bg-background px-2 py-1"
        value={value}
        disabled={busy}
        onChange={(event) => void change(event.target.value)}
      >
        {choices.map((choice) => (
          <option value={choice.value} key={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {message && (
        <span
          role={failed ? "alert" : "status"}
          className={failed ? "max-w-md text-sm text-destructive" : "sr-only"}
        >
          {message}
        </span>
      )}
    </span>
  );
}

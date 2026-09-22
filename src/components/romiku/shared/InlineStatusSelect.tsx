import { useState } from "react";
import { useDataProvider } from "ra-core";

export type InlineStatusChoice = { value: string; label: string };

export function InlineStatusSelect({
  resource,
  recordId,
  status,
  choices,
  label = "状态",
  onUpdated,
}: {
  resource: string;
  recordId: string;
  status: string;
  choices: InlineStatusChoice[];
  label?: string;
  onUpdated?: (status: string) => void;
}) {
  const provider = useDataProvider();
  const [value, setValue] = useState(status);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
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
      onUpdated?.(next);
      setMessage("状态已保存。");
    } catch {
      setValue(previous);
      setFailed(true);
      setMessage("状态保存失败，已恢复原状态。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`${label} ${recordId}`}
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
        <span role={failed ? "alert" : "status"} className="sr-only">
          {message}
        </span>
      )}
    </span>
  );
}

import { useEffect, useState } from "react";
import { parseQuoteUsdCnyRate } from "./quoteWorkflow";

const formatRate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  const [whole, fraction] = parsed.toFixed(6).split(".");
  return `${whole}.${fraction.replace(/0+$/, "").padEnd(4, "0")}`;
};

export function QuoteFxPricing({
  currency,
  enabled,
  rate,
  editable,
  onEnabledChange,
  onRateChange,
}: {
  currency: string;
  enabled: boolean;
  rate: unknown;
  editable: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRateChange: (rate: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatRate(rate));
  const [editingRate, setEditingRate] = useState(false);
  useEffect(() => {
    if (!editingRate) setDraft(formatRate(rate));
  }, [editingRate, rate]);
  if (currency !== "USD") return null;
  const commitRate = (value: string) => {
    try {
      const parsed = parseQuoteUsdCnyRate(value);
      setDraft(formatRate(parsed));
      onRateChange(parsed);
    } catch {
      setDraft(formatRate(rate));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4 rounded border p-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!editable}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        启用汇率换算
      </label>
      {enabled && (
        <label className="flex items-center gap-2">
          USD 汇率
          <input
            aria-label="USD 汇率"
            className="w-28 rounded border p-1"
            type="number"
            min="0"
            step="0.000001"
            inputMode="decimal"
            value={draft}
            disabled={!editable}
            onFocus={() => setEditingRate(true)}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              try {
                onRateChange(parseQuoteUsdCnyRate(next));
              } catch {
                // Keep the raw draft until it becomes valid or the user blurs.
              }
            }}
            onBlur={(event) => {
              setEditingRate(false);
              commitRate(event.target.value);
            }}
          />
          <span>1 USD = X CNY</span>
        </label>
      )}
    </div>
  );
}

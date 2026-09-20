import type { Values } from "../outbound/WorkflowFields";
import { quoteTotals } from "../quotes/quoteWorkflow";
import type { CommercialItem } from "./commercialLineItems";

export function DocumentFinancialSummary({
  items,
  values,
  editable,
  onChange,
}: {
  items: CommercialItem[];
  values: Values;
  editable: boolean;
  onChange: (values: Values) => void;
}) {
  const totals = quoteTotals(items, values);
  const currency = String(values.currency || "USD");
  const update = (
    key: "currency" | "freight" | "other_expenses",
    value: unknown,
  ) => onChange({ ...values, [key]: value });
  return (
    <section
      className="flex flex-wrap items-end gap-4 rounded bg-muted p-4"
      aria-label="金额摘要"
    >
      <span>
        小计：{currency} {totals.subtotal.toFixed(2)}
      </span>
      {editable ? (
        <label className="flex flex-col gap-1 text-sm">
          币种
          <select
            aria-label="币种"
            className="h-8 rounded border bg-background px-2"
            value={currency}
            onChange={(event) => update("currency", event.target.value)}
          >
            <option value="USD">USD</option>
            <option value="CNY">RMB (CNY)</option>
          </select>
        </label>
      ) : (
        <span>币种：{currency === "CNY" ? "RMB (CNY)" : currency}</span>
      )}
      {(["freight", "other_expenses"] as const).map((key) => {
        const label = key === "freight" ? "运费" : "其他费用";
        return editable ? (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {label}
            <input
              aria-label={label}
              className="h-8 w-28 rounded border bg-background px-2"
              type="number"
              step="0.01"
              value={String(values[key] ?? "")}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        ) : (
          <span key={key}>
            {label}：{Number(values[key] || 0).toFixed(2)}
          </span>
        );
      })}
      <span>折扣：{Number(values.discount || 0).toFixed(2)}</span>
      <strong>
        合计：{currency} {totals.total.toFixed(2)}
      </strong>
    </section>
  );
}

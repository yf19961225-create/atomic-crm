import type { Values } from "../outbound/WorkflowFields";

const amount = (total: number, percent: number) =>
  Math.round(total * percent) / 100;
const percentFor = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 10000) / 100 : 0;

/** PI/Order payment split backed solely by the existing deposit_percent field. */
export function DepositBalanceSummary({
  total,
  currency,
  values,
  editable,
  onChange,
}: {
  total: number;
  currency: string;
  values: Values;
  editable: boolean;
  onChange: (values: Values) => void;
}) {
  const depositPercent = Math.min(
    100,
    Math.max(0, Number(values.deposit_percent ?? 30)),
  );
  const balancePercent = 100 - depositPercent;
  const depositAmount = amount(total, depositPercent);
  const balanceAmount = total - depositAmount;
  const setDepositPercent = (value: number) =>
    onChange({ ...values, deposit_percent: Math.min(100, Math.max(0, value)) });
  return (
    <section
      className="flex flex-wrap items-end gap-4 rounded border p-4"
      aria-label="定金与尾款"
    >
      <strong>定金 / 尾款</strong>
      {editable ? (
        <label className="flex flex-col gap-1 text-sm">
          定金比例
          <input
            aria-label="定金比例"
            className="h-8 w-24 rounded border px-2"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={depositPercent}
            onChange={(event) => setDepositPercent(Number(event.target.value))}
          />
        </label>
      ) : (
        <span>定金比例：{depositPercent}%</span>
      )}
      {editable ? (
        <label className="flex flex-col gap-1 text-sm">
          定金金额
          <input
            aria-label="定金金额"
            className="h-8 w-28 rounded border px-2"
            type="number"
            min="0"
            step="0.01"
            value={depositAmount}
            onChange={(event) =>
              setDepositPercent(percentFor(Number(event.target.value), total))
            }
          />
        </label>
      ) : (
        <span>
          定金：{currency} {depositAmount.toFixed(2)}
        </span>
      )}
      <span>尾款比例：{balancePercent}%</span>
      <span>
        尾款：{currency} {balanceAmount.toFixed(2)}
      </span>
    </section>
  );
}

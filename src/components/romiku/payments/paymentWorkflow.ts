import type { Values } from "../outbound/WorkflowFields";

const cents = (value: unknown) =>
  BigInt(
    Number(value || 0)
      .toFixed(2)
      .replace(".", ""),
  );
const money = (value: bigint) => Number(value) / 100;
const positive = (value: bigint) => (value > 0n ? value : 0n);
export function paymentSummary(
  total: number,
  percent: number,
  payments: Values[],
) {
  const totalCents = cents(total);
  const deposit = (totalCents * cents(percent) + 5000n) / 10000n;
  const sum = (kind: string) =>
    payments
      .filter((p) => p.kind === kind)
      .reduce((sum, p) => sum + cents(p.amount), 0n);
  const depositReceived = sum("deposit"),
    balanceReceived = sum("balance"),
    otherReceived = sum("other");
  const received = depositReceived + balanceReceived + otherReceived;
  return {
    expectedDeposit: money(deposit),
    expectedBalance: money(totalCents - deposit),
    depositReceived: money(depositReceived),
    balanceReceived: money(balanceReceived),
    otherReceived: money(otherReceived),
    totalReceived: money(received),
    depositRemaining: money(positive(deposit - depositReceived)),
    balanceRemaining: money(positive(totalCents - deposit - balanceReceived)),
    outstanding: money(positive(totalCents - received)),
    overpaid: money(positive(received - totalCents)),
  };
}
export function paymentWrite(values: Values) {
  if (!["deposit", "balance", "other"].includes(String(values.kind)))
    throw new Error("请选择收款类型。");
  const amount = Number(values.amount);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
  )
    throw new Error("请输入最多两位小数的正数金额。");
  const date = new Date(String(values.received_at || ""));
  if (!Number.isFinite(date.getTime()))
    throw new Error("请输入有效的收款日期。");
  return {
    kind: values.kind,
    amount,
    received_at: date.toISOString(),
    notes: values.notes ?? "",
    payment_account: String(values.payment_account ?? "").trim() || null,
    payment_reference: String(values.payment_reference ?? "").trim() || null,
  };
}

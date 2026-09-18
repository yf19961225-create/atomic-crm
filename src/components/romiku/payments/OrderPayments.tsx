import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { WorkflowFields, type Values } from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { paymentSummary, paymentWrite } from "./paymentWorkflow";
import { paymentKindChoices, paymentKindLabel } from "../commercialLabels";

export function OrderPayments({
  order,
  total,
}: {
  order: RaRecord;
  total: number;
}) {
  const provider = useDataProvider();
  const payments = useQuery({
    queryKey: ["order-payments", order.id],
    queryFn: () =>
      readRelated(provider, "romiku_payments", { order_id: order.id }),
  });
  const [editing, setEditing] = useState<RaRecord | null | undefined>(
    undefined,
  );
  if (payments.isPending) return <p>正在加载收款记录…</p>;
  if (payments.error)
    return (
      <p role="alert">
        无法加载收款记录。{" "}
        <Button onClick={() => payments.refetch()}>重试</Button>
      </p>
    );
  const summary = paymentSummary(
    total,
    Number(order.deposit_percent ?? 30),
    payments.data,
  );
  const labels = {
    expectedDeposit: "应收定金",
    expectedBalance: "应收尾款",
    depositReceived: "已收定金",
    balanceReceived: "已收尾款",
    otherReceived: "其他已收款",
    totalReceived: "已收合计",
    depositRemaining: "定金待收",
    balanceRemaining: "尾款待收",
    outstanding: "待收款",
    overpaid: "超收",
  };
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        收款使用订单币种（{order.currency}
        ）。记录收款后币种不可更改。分类待收金额
        仅比较该类别收款；待收款包含全部收款。
      </p>
      <div className="bg-muted grid gap-3 rounded p-4 sm:grid-cols-2">
        {Object.entries(labels).map(([key, label]) => (
          <span key={key}>
            {label}: {order.currency}{" "}
            {summary[key as keyof typeof summary].toFixed(2)}
          </span>
        ))}
      </div>
      <p>
        定金到期日：{" "}
        {order.deposit_due_at
          ? new Date(order.deposit_due_at).toLocaleString()
          : "—"}{" "}
        · 尾款到期日：{" "}
        {order.balance_due_at
          ? new Date(order.balance_due_at).toLocaleString()
          : "—"}
      </p>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["类型", "收款金额", "收款日期", "备注", "操作"].map((label) => (
                <th className="p-2" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.data.map((payment) => (
              <tr className="border-t" key={payment.id}>
                <td className="p-2">{paymentKindLabel(payment.kind)}</td>
                <td className="p-2">
                  {order.currency} {Number(payment.amount).toFixed(2)}
                </td>
                <td className="p-2">
                  {new Date(payment.received_at).toLocaleString()}
                </td>
                <td className="p-2">{payment.notes}</td>
                <td className="p-2">
                  <Button variant="outline" onClick={() => setEditing(payment)}>
                    编辑收款
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!payments.data.length && <p>暂无收款记录。</p>}
      {editing === undefined ? (
        <Button onClick={() => setEditing(null)}>添加收款</Button>
      ) : (
        <PaymentForm
          key={editing?.id || "new"}
          order={order}
          payment={editing}
          onCancel={() => setEditing(undefined)}
          onSaved={async () => {
            await payments.refetch();
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
function PaymentForm({
  order,
  payment,
  onSaved,
  onCancel,
}: {
  order: RaRecord;
  payment: RaRecord | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const provider = useDataProvider();
  const [values, setValues] = useState<Values>(
    payment || {
      kind: "deposit",
      amount: "",
      received_at: new Date().toISOString(),
      notes: "",
    },
  );
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      const data = paymentWrite(values);
      if (payment)
        await provider.update("romiku_payments", {
          id: payment.id,
          data,
          previousData: payment,
        });
      else
        await provider.create("romiku_payments", {
          data: { ...data, order_id: order.id },
        });
      await onSaved();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-4 rounded border p-4" onSubmit={save}>
      <fieldset disabled={busy} className="space-y-4">
        <h3>
          {payment ? "更正收款" : "新建收款"} · {order.currency}
        </h3>
        <WorkflowFields
          fields={[
            {
              key: "kind",
              label: "收款类型",
              required: true,
              choices: paymentKindChoices,
            },
            { key: "amount", label: "收款金额", required: true },
            {
              key: "received_at",
              label: "收款日期（ISO / 时区）",
              required: true,
            },
            { key: "notes", label: "收款备注", type: "textarea" },
          ]}
          values={values}
          onChange={setValues}
        />
        <div className="flex gap-3">
          <Button type="submit">保存收款</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}

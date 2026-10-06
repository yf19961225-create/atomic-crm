import { LifecycleDialog } from "../shared/LifecycleDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { WorkflowFields, type Values } from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { paymentSummary, paymentWrite } from "./paymentWorkflow";
import { paymentKindChoices, paymentKindLabel } from "../commercialLabels";

export function OrderPayments({
  order,
  total,
  editable = true,
}: {
  order: RaRecord;
  total: number;
  editable?: boolean;
}) {
  const cache = useQueryClient();
  const [voiding, setVoiding] = useState<RaRecord | null>(null);
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
        仅比较该类别有效收款；已作废收款不计入汇总。
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
              {[
                "类型",
                "收款金额",
                "收款日期",
                "收款账户",
                "收款单号",
                "备注",
                "状态 / 审计",
                "操作",
              ].map((label) => (
                <th className="p-2" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.data.map((payment) => (
              <tr
                className={
                  payment.status === "voided"
                    ? "border-t text-muted-foreground"
                    : "border-t"
                }
                key={payment.id}
              >
                <td className="p-2">{paymentKindLabel(payment.kind)}</td>
                <td className="p-2">
                  {order.currency} {Number(payment.amount).toFixed(2)}
                </td>
                <td className="p-2">
                  {new Date(payment.received_at).toLocaleString()}
                </td>
                <td className="p-2">{payment.payment_account || "—"}</td>
                <td className="p-2">{payment.payment_reference || "—"}</td>
                <td className="p-2">{payment.notes}</td>
                <td className="p-2">
                  <span>
                    {payment.status === "voided" ? "已作废" : "已收款"}
                  </span>
                  <div>
                    录入：
                    {payment.created_at
                      ? new Date(payment.created_at).toLocaleString()
                      : "—"}
                  </div>
                  {payment.status === "voided" && (
                    <div>
                      作废：{new Date(payment.voided_at).toLocaleString()}
                      <br />
                      作废人：{payment.voided_by_label || "已登录用户"}
                      <br />
                      原因：{payment.void_reason}
                    </div>
                  )}
                </td>
                <td className="p-2">
                  {editable && payment.status !== "voided" && (
                    <Button
                      variant="outline"
                      onClick={() => setEditing(payment)}
                    >
                      编辑收款
                    </Button>
                  )}
                  {editable && payment.status !== "voided" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`收款更多操作 ${order.currency} ${payment.amount}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setVoiding(payment)}
                        >
                          作废收款
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {voiding && (
        <LifecycleDialog
          kind="payment"
          id={String(voiding.id)}
          label={`${order.currency} ${Number(voiding.amount).toFixed(2)}`}
          onClose={() => setVoiding(null)}
        />
      )}
      {!payments.data.length && <p>暂无收款记录。</p>}
      {editable &&
        (editing === undefined ? (
          <Button onClick={() => setEditing(null)}>添加收款</Button>
        ) : (
          <PaymentForm
            key={editing?.id || "new"}
            order={order}
            payment={editing}
            onCancel={() => setEditing(undefined)}
            onSaved={async () => {
              await cache.invalidateQueries();
              setEditing(undefined);
            }}
          />
        ))}
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
      payment_account: "",
      payment_reference: "",
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
            { key: "payment_account", label: "收款账户" },
            { key: "payment_reference", label: "收款单号" },
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

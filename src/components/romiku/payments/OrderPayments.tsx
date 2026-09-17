import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { WorkflowFields, type Values } from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { paymentSummary, paymentWrite } from "./paymentWorkflow";

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
  if (payments.isPending) return <p>Loading payments…</p>;
  if (payments.error)
    return (
      <p role="alert">
        Could not load payments.{" "}
        <Button onClick={() => payments.refetch()}>Retry</Button>
      </p>
    );
  const summary = paymentSummary(
    total,
    Number(order.deposit_percent ?? 30),
    payments.data,
  );
  const labels = {
    expectedDeposit: "Expected deposit",
    expectedBalance: "Expected balance",
    depositReceived: "Deposit received",
    balanceReceived: "Balance received",
    otherReceived: "Other received",
    totalReceived: "Total received",
    depositRemaining: "Deposit remaining",
    balanceRemaining: "Balance remaining",
    outstanding: "Outstanding",
    overpaid: "Overpaid",
  };
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Receipts use the Order currency ({order.currency}). Its currency is
        fixed after a payment is recorded. Category remaining amounts compare
        each category's receipts; outstanding includes every receipt.
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
        Deposit due:{" "}
        {order.deposit_due_at
          ? new Date(order.deposit_due_at).toLocaleString()
          : "—"}{" "}
        · Balance due:{" "}
        {order.balance_due_at
          ? new Date(order.balance_due_at).toLocaleString()
          : "—"}
      </p>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Kind",
                "Amount received",
                "Received date",
                "Notes",
                "Actions",
              ].map((label) => (
                <th className="p-2" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.data.map((payment) => (
              <tr className="border-t" key={payment.id}>
                <td className="p-2">{payment.kind}</td>
                <td className="p-2">
                  {order.currency} {Number(payment.amount).toFixed(2)}
                </td>
                <td className="p-2">
                  {new Date(payment.received_at).toLocaleString()}
                </td>
                <td className="p-2">{payment.notes}</td>
                <td className="p-2">
                  <Button variant="outline" onClick={() => setEditing(payment)}>
                    Edit payment
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!payments.data.length && <p>No payments recorded.</p>}
      {editing === undefined ? (
        <Button onClick={() => setEditing(null)}>Add payment</Button>
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
          {payment ? "Correct payment" : "New payment"} · {order.currency}
        </h3>
        <WorkflowFields
          fields={[
            {
              key: "kind",
              label: "Payment kind",
              required: true,
              options: ["deposit", "balance", "other"],
            },
            { key: "amount", label: "Amount received", required: true },
            {
              key: "received_at",
              label: "Received date (ISO / timezone)",
              required: true,
            },
            { key: "notes", label: "Payment notes", type: "textarea" },
          ]}
          values={values}
          onChange={setValues}
        />
        <div className="flex gap-3">
          <Button type="submit">Save payment</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}

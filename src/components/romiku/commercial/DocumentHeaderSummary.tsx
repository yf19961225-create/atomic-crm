import type { Values } from "../outbound/WorkflowFields";
import { setValue, valueAt } from "../outbound/WorkflowFields";
import type { RaRecord } from "ra-core";
import type { CommercialDocumentKind } from "./commercialLineItems";

type HeaderField = { key: string; label: string; orderOnly?: boolean };

const customerFields: HeaderField[] = [
  { key: "counterparty_snapshot.name", label: "客户名称" },
  { key: "counterparty_snapshot.brand", label: "品牌" },
  { key: "counterparty_snapshot.country", label: "国家/地区" },
  { key: "counterparty_snapshot.contact", label: "联系人" },
  { key: "counterparty_snapshot.whatsapp", label: "WhatsApp" },
  { key: "counterparty_snapshot.email", label: "Email" },
];
const documentFields: HeaderField[] = [
  { key: "document_date", label: "单据日期" },
  { key: "due_at", label: "计划收款日期" },
  { key: "currency", label: "币种" },
  { key: "expected_delivery_at", label: "送货日期", orderOnly: true },
  {
    key: "counterparty_snapshot.shipping_address",
    label: "收货地址",
    orderOnly: true,
  },
];

const display = (value: unknown) => {
  if (!value) return "—";
  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text;
};

/** Compact first-page, document-snapshot summary shared by Quote, PI and Order. */
export function DocumentHeaderSummary({
  kind,
  values,
  editable,
  onChange,
  customers = [],
}: {
  kind: CommercialDocumentKind;
  values: Values;
  editable: boolean;
  onChange: (values: Values) => void;
  customers?: RaRecord[];
}) {
  const fields = [
    ...customerFields,
    ...documentFields.filter((field) => kind === "order" || !field.orderOnly),
  ];
  return (
    <section className="rounded border bg-muted/30 p-4" aria-label="单据摘要">
      {editable && (
        <label className="mb-3 flex max-w-sm flex-col gap-1 text-sm">
          选择正式客户
          <select
            aria-label="选择正式客户"
            className="h-8 rounded border bg-background px-2"
            value=""
            onChange={(event) => {
              const customer = customers.find(
                (candidate) => String(candidate.id) === event.target.value,
              );
              if (!customer) return;
              const keys = [
                "name",
                "brand",
                "country",
                "contact",
                "whatsapp",
                "email",
                "phone",
                "address",
                "shipping_address",
                "billing_address",
                "consignee",
                "consignee_contact",
              ];
              const snapshot = Object.fromEntries(
                keys
                  .filter((key) => customer[key] != null)
                  .map((key) => [key, customer[key]]),
              );
              onChange({
                ...values,
                counterparty_snapshot: snapshot,
              });
            }}
          >
            <option value="">不关联正式客户（仅当前单据）</option>
            {customers.map((customer) => (
              <option value={String(customer.id)} key={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => {
          const value = valueAt(values, field.key);
          return (
            <div key={field.key} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{field.label}</dt>
              <dd className="mt-1">
                {editable ? (
                  <input
                    aria-label={field.label}
                    className="h-8 w-full rounded border bg-background px-2 text-sm"
                    value={String(value ?? "")}
                    onChange={(event) =>
                      onChange(setValue(values, field.key, event.target.value))
                    }
                  />
                ) : (
                  <span className="break-words text-sm">{display(value)}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

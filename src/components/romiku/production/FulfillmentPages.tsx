import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { errorMessage } from "../outbound/RelatedRecords";
import { readRelated } from "../outbound/workflow";
import { fulfillmentConfig, type FulfillmentKind } from "./fulfillmentShared";
import { FulfillmentItems } from "./FulfillmentItems";

export function FulfillmentList({ kind }: { kind: FulfillmentKind }) {
  const config = fulfillmentConfig[kind],
    [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const orderId = params.get("order");
  const query = useGetList(config.resource, {
    pagination: { page, perPage: 25 },
    sort: { field: "created_at", order: "DESC" },
    filter: orderId ? { order_id: orderId } : {},
  });
  return (
    <section className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-3xl font-semibold">{config.plural}</h1>
        <Button asChild>
          <Link
            to={`${config.path}/new${orderId ? `?order=${encodeURIComponent(orderId)}` : ""}`}
          >
            New {config.label}
          </Link>
        </Button>
      </div>
      {orderId && (
        <p>
          Order:{" "}
          <Link className="underline" to={`/orders/${orderId}`}>
            {orderId}
          </Link>{" "}
          ·{" "}
          <Link className="underline" to={config.path}>
            All records
          </Link>
        </p>
      )}
      {query.isPending && <p>Loading {config.plural}…</p>}
      {query.error && (
        <p role="alert">
          Could not load records.{" "}
          <Button onClick={() => query.refetch()}>Retry</Button>
        </p>
      )}
      <div className="overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Document",
                "Order",
                ...(kind === "production"
                  ? ["Supplier", "Status", "Factory due"]
                  : ["Batch", "Packing date", "Shipping mark"]),
              ].map((title) => (
                <th className="p-3" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data?.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="p-3">
                  <Link
                    className="underline"
                    to={`${config.path}/${record.id}`}
                  >
                    {record.document_number || record.id}
                  </Link>
                </td>
                <td className="p-3">
                  <Link className="underline" to={`/orders/${record.order_id}`}>
                    {record.order_id}
                  </Link>
                </td>
                {(kind === "production"
                  ? [
                      record.supplier_snapshot?.name,
                      record.status,
                      record.factory_due_at,
                    ]
                  : [
                      record.batch_label,
                      record.packing_at,
                      record.shipping_mark,
                    ]
                ).map((value, i) => (
                  <td className="p-3" key={i}>
                    {value || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {query.data?.length === 0 && <p className="p-6">No records found.</p>}
      </div>
      <div className="flex gap-3">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          disabled={
            query.total !== undefined
              ? page * 25 >= query.total
              : (query.data?.length || 0) < 25
          }
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
export function FulfillmentDetail({ kind }: { kind: FulfillmentKind }) {
  const { id = "" } = useParams(),
    config = fulfillmentConfig[kind];
  const query = useGetOne(config.resource, { id });
  if (query.isPending) return <p>Loading {config.label}…</p>;
  if (query.error || !query.data)
    return (
      <p role="alert">
        Could not load {config.label}.{" "}
        <Button onClick={() => query.refetch()}>Retry</Button>
      </p>
    );
  return (
    <FulfillmentEditor
      key={`${kind}:${id}`}
      kind={kind}
      record={query.data}
      onSaved={query.refetch}
    />
  );
}
const productionFields: Field[] = [
  { key: "name", label: "Production name" },
  {
    key: "status",
    label: "Production status",
    required: true,
    options: ["pending", "in_production", "completed", "received", "cancelled"],
  },
  { key: "factory_due_at", label: "Factory due (ISO / timezone)" },
  { key: "anomaly_notes", label: "Anomaly notes", type: "textarea" },
  { key: "notes", label: "Production notes", type: "textarea" },
];
const packingFields: Field[] = [
  { key: "name", label: "Packing name" },
  { key: "batch_label", label: "Batch" },
  { key: "packing_at", label: "Packing date (ISO / timezone)" },
  { key: "shipping_mark", label: "List shipping mark" },
  { key: "notes", label: "Packing notes", type: "textarea" },
];
function FulfillmentEditor({
  kind,
  record,
  onSaved,
}: {
  kind: FulfillmentKind;
  record: RaRecord;
  onSaved: () => Promise<unknown>;
}) {
  const provider = useDataProvider(),
    config = fulfillmentConfig[kind];
  const [values, setValues] = useState<Values>(record),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [saved, setSaved] = useState(false);
  const items = useQuery({
    queryKey: ["fulfillment-items", kind, record.id],
    queryFn: () =>
      readRelated(provider, config.items, { [config.foreignKey]: record.id }),
  });
  const fields = kind === "production" ? productionFields : packingFields;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setSaved(false);
    try {
      const data = Object.fromEntries(
        fields.map(({ key }) => [key, values[key] || null]),
      );
      const dateKey = kind === "production" ? "factory_due_at" : "packing_at";
      if (data[dateKey]) {
        const date = new Date(String(data[dateKey]));
        if (!Number.isFinite(date.getTime()))
          throw new Error("Enter a valid date.");
        data[dateKey] = date.toISOString();
      }
      const result = await provider.update(config.resource, {
        id: record.id,
        data,
        previousData: record,
      });
      setValues(result.data);
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-6xl space-y-5">
      <Link className="underline" to={config.path}>
        Back to {config.plural}
      </Link>
      <h1 className="text-3xl font-semibold">
        {record.document_number || config.label}
      </h1>
      <p>
        Source Order:{" "}
        <Link className="underline" to={`/orders/${record.order_id}`}>
          {record.order_id}
        </Link>
      </p>
      {kind === "production" && (
        <div className="rounded border p-4">
          <p>
            Supplier:{" "}
            <Link
              className="underline"
              to={`/romiku_suppliers/${record.supplier_id}`}
            >
              {record.supplier_snapshot?.name || record.supplier_id}
            </Link>
          </p>
          <p>{record.supplier_snapshot?.address}</p>
          <p className="text-muted-foreground text-sm">
            This Production Order has one supplier. Its supplier and product
            snapshots are independent of the Order.
          </p>
        </div>
      )}
      <details>
        <summary className="cursor-pointer">{config.label} details</summary>
        <form className="space-y-4 py-4" onSubmit={save}>
          <fieldset disabled={busy} className="space-y-4">
            <WorkflowFields
              fields={fields}
              values={values}
              onChange={setValues}
            />
            <Button type="submit">Save {config.label}</Button>
          </fieldset>
        </form>
      </details>
      {failure && <p role="alert">{failure}</p>}
      {saved && <p role="status">{config.label} saved.</p>}
      {items.error ? (
        <p role="alert">
          Could not load items.{" "}
          <Button onClick={() => items.refetch()}>Retry</Button>
        </p>
      ) : items.isPending ? (
        <p>Loading items…</p>
      ) : (
        <FulfillmentItems
          kind={kind}
          parent={record}
          items={items.data}
          onChanged={items.refetch}
        />
      )}
    </section>
  );
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { QuoteItems } from "../quotes/QuoteItems";
import { quoteTotals } from "../quotes/quoteWorkflow";
import { OrderPayments } from "../payments/OrderPayments";
import { DocumentConversion } from "./DocumentConversion";
import {
  createDocument,
  documentConfig,
  documentHeaderWrite,
  type DocumentKind,
} from "./documentWorkflow";

function DocumentSources({ record }: { record: RaRecord }) {
  const links = [
    [record.source_quote_id, "/quotes/", "Quote"],
    [record.source_pi_id, "/pi/", "PI"],
    [
      record.source_website_inquiry_id,
      "/website-inquiries?record=",
      "Website Inquiry",
    ],
    [record.outbound_company_id, "/outbound-development?record=", "Outbound"],
    [record.formal_customer_id, "/formal-customers?record=", "Formal Customer"],
  ].filter(([id]) => id);
  return (
    <div className="flex gap-3 text-sm">
      {links.length ? (
        links.map(([id, path, label]) => (
          <Link
            key={label}
            className="underline"
            to={`${path}${encodeURIComponent(id)}`}
          >
            {label}
          </Link>
        ))
      ) : (
        <span>Direct</span>
      )}
    </div>
  );
}
export function DocumentList({ kind }: { kind: DocumentKind }) {
  const config = documentConfig[kind];
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const {
    data = [],
    total,
    isPending,
    error,
    refetch,
  } = useGetList(config.totals, {
    pagination: { page, perPage: 25 },
    sort: { field: "created_at", order: "DESC" },
    filter: {
      ...(search ? { "document_number@ilike": `%${search}%` } : {}),
      ...(status ? { status } : {}),
    },
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{config.plural}</h1>
        <Button asChild>
          <Link to={`${config.path}/new`}>New {config.label}</Link>
        </Button>
      </div>
      <p className="text-muted-foreground">
        Independent buyer, product and commercial snapshots with retained source
        history.
      </p>
      <div className="flex gap-4">
        <label>
          Document number{" "}
          <input
            className="rounded border p-2"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Status{" "}
          <select
            className="rounded border p-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {config.statuses.map((status) => (
              <option value={status} key={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending && <p>Loading {config.plural}…</p>}
      {error && (
        <p role="alert">
          Could not load {config.plural}.{" "}
          <Button onClick={() => refetch()}>Retry</Button>
        </p>
      )}
      <div className="overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                config.label,
                "Buyer",
                "Source",
                "Status",
                "Date",
                "Total",
                ...(kind === "order" ? ["Outstanding"] : []),
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((record) => (
              <tr className="border-t" key={record.id}>
                <td className="p-3">
                  <Link
                    className="underline"
                    to={`${config.path}/${record.id}`}
                  >
                    {record.document_number}
                  </Link>
                </td>
                <td className="p-3">{record.counterparty_snapshot?.name}</td>
                <td className="p-3">
                  <DocumentSources record={record} />
                </td>
                <td className="p-3">{record.status}</td>
                <td className="p-3">{record.document_date}</td>
                <td className="p-3">
                  {record.currency} {Number(record.total).toFixed(2)}
                </td>
                {kind === "order" && (
                  <td className="p-3">
                    {record.currency}{" "}
                    {Number(record.remaining_amount).toFixed(2)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !error && !data.length && (
          <p className="p-6 text-center">No {config.plural} found.</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page}
          {total !== undefined && ` · ${total} records`}
        </span>
        <Button
          variant="outline"
          disabled={total !== undefined ? page * 25 >= total : data.length < 25}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
export function DocumentCreate({ kind }: { kind: DocumentKind }) {
  const config = documentConfig[kind],
    provider = useDataProvider(),
    navigate = useNavigate();
  const [values, setValues] = useState<Values>({ name: "" }),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      const { data } = await createDocument(
        provider,
        kind,
        String(values.name || ""),
      );
      navigate(`${config.path}/${data.id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-3xl space-y-4">
      <Link className="underline" to={config.path}>
        Back to {config.plural}
      </Link>
      <h1 className="text-3xl font-semibold">New {config.label}</h1>
      <p>
        Create a direct {config.label}. To copy an existing document, open its
        detail page and use Create {config.label}.
      </p>
      <form className="space-y-4" onSubmit={create}>
        <fieldset disabled={busy} className="space-y-4">
          <WorkflowFields
            fields={[{ key: "name", label: "Buyer name", required: true }]}
            values={values}
            onChange={setValues}
          />
          <Button type="submit">Create {config.label}</Button>
        </fieldset>
        {failure && <p role="alert">{failure}</p>}
      </form>
    </section>
  );
}
export function DocumentDetail({ kind }: { kind: DocumentKind }) {
  const { id = "" } = useParams(),
    config = documentConfig[kind];
  const { data, isPending, error, refetch } = useGetOne(config.resource, {
    id,
  });
  if (isPending) return <p>Loading {config.label}…</p>;
  if (error || !data)
    return (
      <p role="alert">
        Could not load this {config.label}.{" "}
        <Link className="underline" to={config.path}>
          Back to {config.plural}
        </Link>
      </p>
    );
  return (
    <DocumentEditor
      key={`${kind}:${id}`}
      kind={kind}
      record={data}
      onSaved={refetch}
    />
  );
}
const buyerFields: Field[] = [
  { key: "counterparty_snapshot.name", label: "Buyer name", required: true },
  { key: "counterparty_snapshot.company", label: "Company" },
  { key: "counterparty_snapshot.contact", label: "Contact name" },
  { key: "counterparty_snapshot.email", label: "Email", type: "email" },
  { key: "counterparty_snapshot.phone", label: "Phone" },
  { key: "counterparty_snapshot.whatsapp", label: "WhatsApp" },
  { key: "counterparty_snapshot.country", label: "Country" },
  {
    key: "counterparty_snapshot.address",
    label: "Buyer address",
    type: "textarea",
  },
  { key: "counterparty_snapshot.consignee", label: "Consignee" },
  {
    key: "counterparty_snapshot.consignee_contact",
    label: "Consignee contact",
  },
  {
    key: "counterparty_snapshot.shipping_address",
    label: "Shipping address",
    type: "textarea",
  },
  {
    key: "counterparty_snapshot.billing_address",
    label: "Billing address",
    type: "textarea",
  },
  { key: "currency", label: "Currency", required: true },
  { key: "document_date", label: "Document date (YYYY-MM-DD)" },
];
const termsFields: Field[] = [
  { key: "price_term", label: "Price term" },
  { key: "shipment_method", label: "Shipment method" },
  {
    key: "terms_snapshot.payment_terms",
    label: "Payment terms",
    type: "textarea",
  },
  {
    key: "terms_snapshot.delivery_terms",
    label: "Delivery terms",
    type: "textarea",
  },
  { key: "terms_snapshot.lead_time", label: "Lead time" },
  {
    key: "terms_snapshot.clauses",
    label: "Commercial clauses",
    type: "textarea",
  },
  { key: "bank_snapshot.details", label: "Bank details", type: "textarea" },
  { key: "freight", label: "Freight" },
  { key: "other_expenses", label: "Other expenses" },
  { key: "discount", label: "Discount" },
  { key: "deposit_percent", label: "Deposit percentage", required: true },
  { key: "deposit_due_at", label: "Deposit due (ISO / timezone)" },
  { key: "balance_due_at", label: "Balance due (ISO / timezone)" },
];
function DocumentEditor({
  kind,
  record,
  onSaved,
}: {
  kind: DocumentKind;
  record: RaRecord;
  onSaved: () => Promise<unknown>;
}) {
  const config = documentConfig[kind],
    provider = useDataProvider();
  const [values, setValues] = useState<Values>(record),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const items = useQuery({
    queryKey: [`${kind}-items`, record.id],
    queryFn: () =>
      readRelated(provider, config.items, { [config.foreignKey]: record.id }),
  });
  const totals = quoteTotals(items.data || [], record);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await provider.update(config.resource, {
        id: record.id,
        data: documentHeaderWrite(kind, values),
        previousData: record,
      });
      setValues(result.data);
      await onSaved();
      setMessage(`${config.label} saved.`);
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const details: Field[] = [
    ...buyerFields,
    {
      key: "status",
      label: `${config.label} status`,
      options: config.statuses,
      required: true,
    },
    ...(kind === "pi"
      ? [
          {
            key: "terms_snapshot.valid_until",
            label: "Valid until (YYYY-MM-DD)",
          },
        ]
      : [{ key: "purchase_order_number", label: "Customer PO number" }]),
  ];
  const delivery: Field[] =
    kind === "order"
      ? [
          {
            key: "expected_delivery_at",
            label: "Expected delivery (ISO / timezone)",
          },
          {
            key: "actual_delivery_at",
            label: "Actual delivery (ISO / timezone)",
          },
        ]
      : [
          {
            key: "terms_snapshot.expected_delivery",
            label: "Expected delivery (YYYY-MM-DD)",
          },
        ];
  const tabs = [
    { name: "Buyer & details", fields: details },
    { name: "Terms & expenses", fields: termsFields },
    {
      name: "Delivery & notes",
      fields: [
        ...delivery,
        {
          key: "notes",
          label: `${config.label} notes`,
          type: "textarea" as const,
        },
      ],
    },
  ];
  return (
    <section className="max-w-6xl space-y-4">
      <Link className="underline" to={config.path}>
        Back to {config.plural}
      </Link>
      <h1 className="text-3xl font-semibold">
        {record.document_number || `Draft ${config.label}`}
      </h1>
      <DocumentSources record={record} />
      {kind === "order" && (
        <div className="flex gap-4">
          <Link className="underline" to={`/production?order=${record.id}`}>
            Production Orders
          </Link>
          <Link
            className="underline"
            to={`/packing-shipping?order=${record.id}`}
          >
            Packing Lists
          </Link>
        </div>
      )}
      {kind === "pi" && (
        <DocumentConversion source="pi" sourceId={String(record.id)} />
      )}
      <p className="text-muted-foreground text-sm">
        Edits apply to this {config.label}'s snapshots. Source documents retain
        their original values.
      </p>
      {items.error ? (
        <p role="alert">
          Could not load items or totals.{" "}
          <Button onClick={() => items.refetch()}>Retry</Button>
        </p>
      ) : items.isPending ? (
        <p>Loading totals…</p>
      ) : (
        <div className="bg-muted flex gap-6 rounded p-4">
          <span>
            Subtotal: {record.currency} {totals.subtotal.toFixed(2)}
          </span>
          <strong>
            Total: {record.currency} {totals.total.toFixed(2)}
          </strong>
          <span className="text-muted-foreground text-sm">Saved values</span>
        </div>
      )}
      <Tabs defaultValue="Items" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="Items">Items</TabsTrigger>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.name} value={tab.name}>
              {tab.name}
            </TabsTrigger>
          ))}
          {kind === "order" && (
            <TabsTrigger value="Payments">Payments</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="Items">
          {items.data && (
            <QuoteItems
              kind={kind}
              quoteId={String(record.id)}
              items={items.data}
              onChanged={items.refetch}
            />
          )}
        </TabsContent>
        {tabs.map((tab) => (
          <TabsContent key={tab.name} value={tab.name}>
            <form className="space-y-4" onSubmit={save}>
              <fieldset disabled={busy} className="space-y-4">
                <WorkflowFields
                  fields={tab.fields}
                  values={values}
                  onChange={setValues}
                />
                <Button type="submit">Save {config.label}</Button>
              </fieldset>
            </form>
          </TabsContent>
        ))}
        {kind === "order" && (
          <TabsContent value="Payments">
            {items.data && (
              <OrderPayments order={record} total={totals.total} />
            )}
          </TabsContent>
        )}
      </Tabs>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </section>
  );
}

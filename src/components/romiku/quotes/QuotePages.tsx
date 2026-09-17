import { useState } from "react";
import { Link, useParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { quoteHeaderWrite, quoteStatuses, quoteTotals } from "./quoteWorkflow";
import { QuoteItems } from "./QuoteItems";

function SourceLinks({ record }: { record: RaRecord }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {record.source_website_inquiry_id && (
        <Link
          className="underline"
          to={`/website-inquiries?record=${encodeURIComponent(record.source_website_inquiry_id)}`}
        >
          Website Inquiry
        </Link>
      )}
      {record.outbound_company_id && (
        <Link
          className="underline"
          to={`/outbound-development?record=${encodeURIComponent(record.outbound_company_id)}`}
        >
          Outbound
        </Link>
      )}
      {record.formal_customer_id && (
        <Link
          className="underline"
          to={`/formal-customers?record=${encodeURIComponent(record.formal_customer_id)}`}
        >
          Formal Customer
        </Link>
      )}
      {!record.source_website_inquiry_id &&
        !record.outbound_company_id &&
        !record.formal_customer_id && <span>Direct</span>}
    </div>
  );
}
export function QuoteList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const {
    data = [],
    total,
    isPending,
    error,
    refetch,
  } = useGetList("romiku_quote_totals", {
    pagination: { page, perPage: 25 },
    sort: { field: "created_at", order: "DESC" },
    filter: {
      ...(status ? { status } : {}),
      ...(search ? { "document_number@ilike": `%${search}%` } : {}),
    },
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Quotes</h1>
        <Button asChild>
          <Link to="/quotes/new">New Quote</Link>
        </Button>
      </div>
      <p className="text-muted-foreground">
        Independent quotations with source history and editable buyer, product
        and commercial snapshots.
      </p>
      <div className="flex flex-wrap gap-4">
        <label>
          Quote number{" "}
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
            {quoteStatuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending && <p>Loading Quotes…</p>}
      {error && (
        <div role="alert">
          Could not load Quotes.{" "}
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "Quote",
                "Buyer",
                "Source",
                "Status",
                "Date",
                "Valid until",
                "Total",
              ].map((label) => (
                <th key={label} className="p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="p-3">
                  <Link
                    className="font-medium underline"
                    to={`/quotes/${record.id}`}
                  >
                    {record.document_number}
                  </Link>
                </td>
                <td className="p-3">{record.counterparty_snapshot?.name}</td>
                <td className="p-3">
                  <SourceLinks record={record} />
                </td>
                <td className="p-3">{record.status}</td>
                <td className="p-3">{record.document_date}</td>
                <td className="p-3">{record.valid_until || "—"}</td>
                <td className="p-3">
                  {record.currency} {Number(record.total).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !error && !data.length && (
          <p className="p-6 text-center">No Quotes found.</p>
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
          {total !== undefined && ` · ${total} Quotes`}
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
export function QuoteDetail() {
  const { id = "" } = useParams();
  const { data, isPending, error, refetch } = useGetOne("romiku_quotes", {
    id,
  });
  if (isPending) return <p>Loading Quote…</p>;
  if (error || !data)
    return (
      <p role="alert">
        Could not load this Quote.{" "}
        <Link to="/quotes" className="underline">
          Back to Quotes
        </Link>
      </p>
    );
  return <QuoteEditor key={id} record={data} onSaved={refetch} />;
}
const buyerFields: Field[] = [
  { key: "counterparty_snapshot.name", label: "Buyer name", required: true },
  { key: "counterparty_snapshot.company", label: "Company" },
  { key: "counterparty_snapshot.email", label: "Email", type: "email" },
  { key: "counterparty_snapshot.whatsapp", label: "WhatsApp" },
  { key: "counterparty_snapshot.country", label: "Country" },
  { key: "counterparty_snapshot.address", label: "Address", type: "textarea" },
  {
    key: "status",
    label: "Quote status",
    required: true,
    options: quoteStatuses,
  },
  { key: "currency", label: "Currency", required: true },
  { key: "document_date", label: "Document date (YYYY-MM-DD)" },
  { key: "valid_until", label: "Valid until (YYYY-MM-DD)" },
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
  { key: "bank_snapshot.details", label: "Bank details", type: "textarea" },
  { key: "freight", label: "Freight" },
  { key: "other_expenses", label: "Other expenses" },
  { key: "discount", label: "Discount" },
  { key: "notes", label: "Quote notes", type: "textarea" },
];
function QuoteEditor({
  record,
  onSaved,
}: {
  record: RaRecord;
  onSaved: () => Promise<unknown>;
}) {
  const provider = useDataProvider();
  const [values, setValues] = useState<Values>(record);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const items = useQuery({
    queryKey: ["quote-items", record.id],
    queryFn: () =>
      readRelated(provider, "romiku_quote_items", { quote_id: record.id }),
  });
  const totals = quoteTotals(items.data || [], record);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await provider.update("romiku_quotes", {
        id: record.id,
        data: quoteHeaderWrite(values),
        previousData: record,
      });
      setValues(result.data);
      await onSaved();
      setMessage("Quote saved.");
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="max-w-6xl space-y-4">
      <Link to="/quotes" className="underline">
        Back to Quotes
      </Link>
      <h1 className="text-3xl font-semibold">
        {record.document_number || "Draft Quote"}
      </h1>
      <SourceLinks record={record} />
      <p className="text-muted-foreground text-sm">
        Source links are retained. Quote edits apply only to this document.
      </p>
      {items.error ? (
        <p role="alert">
          Could not load Quote items or totals.{" "}
          <Button variant="outline" onClick={() => items.refetch()}>
            Retry
          </Button>
        </p>
      ) : items.isPending ? (
        <p>Loading totals…</p>
      ) : (
        <div className="bg-muted flex flex-wrap gap-6 rounded p-4">
          <span>
            Subtotal: {record.currency} {totals.subtotal.toFixed(2)}
          </span>
          <span>Freight: {Number(record.freight || 0).toFixed(2)}</span>
          <span>
            Other expenses: {Number(record.other_expenses || 0).toFixed(2)}
          </span>
          <span>Discount: {Number(record.discount || 0).toFixed(2)}</span>
          <strong>
            Total: {record.currency} {totals.total.toFixed(2)}
          </strong>
          <span className="text-muted-foreground text-xs">Saved values</span>
        </div>
      )}
      <Tabs defaultValue="Items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="Items">Items</TabsTrigger>
          <TabsTrigger value="Buyer">Buyer & details</TabsTrigger>
          <TabsTrigger value="Terms">Terms & expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="Items">
          {items.data && (
            <QuoteItems
              quoteId={String(record.id)}
              items={items.data}
              onChanged={items.refetch}
            />
          )}
        </TabsContent>
        <form onSubmit={save} className="space-y-4">
          <TabsContent value="Buyer">
            <fieldset disabled={busy} className="space-y-4">
              <WorkflowFields
                fields={buyerFields}
                values={values}
                onChange={setValues}
              />
              <Button type="submit" disabled={busy}>
                Save Quote
              </Button>
            </fieldset>
          </TabsContent>
          <TabsContent value="Terms">
            <fieldset disabled={busy} className="space-y-4">
              <WorkflowFields
                fields={termsFields}
                values={values}
                onChange={setValues}
              />
              <Button type="submit" disabled={busy}>
                Save Quote
              </Button>
            </fieldset>
          </TabsContent>
          {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </form>
      </Tabs>
    </section>
  );
}

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDataProvider, useGetOne } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  createQuote,
  quoteFromInquiry,
  quoteSourceResources,
  type QuoteSource,
} from "./quoteWorkflow";

export function QuoteCreate() {
  const [params] = useSearchParams();
  const initialSource = params.get("source");
  const [source, setSource] = useState<QuoteSource>(
    initialSource === "inquiry" ||
      initialSource === "outbound" ||
      initialSource === "customer"
      ? initialSource
      : "direct",
  );
  const [sourceId, setSourceId] = useState(params.get("sourceId") || "");
  const [buyer, setBuyer] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const provider = useDataProvider();
  const navigate = useNavigate();
  const choices = useQuery({
    queryKey: ["quote-source-choices", source],
    queryFn: () =>
      readRelated(
        provider,
        quoteSourceResources[source as Exclude<QuoteSource, "direct">],
        {},
      ),
    enabled: source !== "direct",
  });
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (source === "inquiry") return;
    setBusy(true);
    setFailure("");
    try {
      const result = await createQuote(provider, source, sourceId, buyer);
      navigate(`/quotes/${result.data.id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="max-w-4xl space-y-5">
      <Link to="/quotes" className="underline">
        Back to Quotes
      </Link>
      <h1 className="text-3xl font-semibold">New Quote</h1>
      <p className="text-muted-foreground">
        Create an independent quotation. Buyer and product snapshots belong to
        this Quote; no formal customer is created.
      </p>
      <form onSubmit={create} className="space-y-4">
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            Source
            <select
              className="rounded border p-2"
              value={source}
              onChange={(event) => {
                setSource(event.target.value as QuoteSource);
                setSourceId("");
                setFailure("");
              }}
            >
              <option value="direct">Direct</option>
              <option value="inquiry">Website Inquiry</option>
              <option value="outbound">Outbound</option>
              <option value="customer">Formal Customer</option>
            </select>
          </label>
          {source === "direct" ? (
            <label className="flex flex-col gap-1">
              Buyer name
              <input
                className="rounded border p-2"
                required
                value={buyer}
                onChange={(event) => setBuyer(event.target.value)}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              Source record
              <select
                className="rounded border p-2"
                required
                disabled={choices.isPending || !!choices.error}
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">Choose a record</option>
                {choices.data?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.document_number
                      ? `${row.document_number} · ${row.customer_name}`
                      : row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        {source !== "direct" && choices.error && (
          <p role="alert">Source records could not be loaded.</p>
        )}
        {source !== "inquiry" && (
          <Button
            type="submit"
            disabled={
              busy ||
              (source !== "direct" &&
                (!sourceId || choices.isPending || !!choices.error))
            }
          >
            {busy ? "Creating…" : "Create Quote"}
          </Button>
        )}
        {failure && <p role="alert">{failure}</p>}
      </form>
      {source === "inquiry" && sourceId && (
        <InquiryConfirmation
          key={sourceId}
          inquiryId={sourceId}
          onCreated={(id) => navigate(`/quotes/${id}`)}
        />
      )}
    </section>
  );
}

function InquiryConfirmation({
  inquiryId,
  onCreated,
}: {
  inquiryId: string;
  onCreated: (id: string) => void;
}) {
  const provider = useDataProvider();
  const inquiry = useGetOne("romiku_website_inquiries", { id: inquiryId });
  const items = useQuery({
    queryKey: ["quote-original-items", inquiryId],
    queryFn: () =>
      readRelated(provider, "romiku_website_inquiry_items", {
        inquiry_id: inquiryId,
      }),
  });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const selected = (items.data || [])
    .filter((item) => !excluded.includes(String(item.id)))
    .map((item) => String(item.id));
  const confirm = async () => {
    setBusy(true);
    setFailure("");
    try {
      onCreated(
        await quoteFromInquiry(getSupabaseClient(), inquiryId, selected),
      );
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  if (inquiry.isPending || items.isPending)
    return <p>Loading original inquiry…</p>;
  if (inquiry.error || items.error || !inquiry.data)
    return <p role="alert">Could not load the original inquiry.</p>;
  return (
    <section className="space-y-4 rounded border p-4">
      <h2 className="text-xl font-semibold">Confirm inquiry items</h2>
      <p>
        {inquiry.data.document_number} · {inquiry.data.customer_name} ·{" "}
        {inquiry.data.email}
      </p>
      <p className="text-muted-foreground text-sm">
        Select all or a subset. Confirmation copies the selected original items
        into a new Quote. You can edit the Quote copies afterward.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setExcluded([])}>
            Select all
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setExcluded((items.data || []).map((item) => String(item.id)))
            }
          >
            Clear selection
          </Button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Include</th>
              <th>SKU</th>
              <th>Original quantity</th>
              <th>Original requirement</th>
            </tr>
          </thead>
          <tbody>
            {items.data?.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="py-3">
                  <input
                    type="checkbox"
                    aria-label={`Include ${item.sku}`}
                    checked={!excluded.includes(String(item.id))}
                    onChange={(event) =>
                      setExcluded(
                        event.target.checked
                          ? excluded.filter((id) => id !== String(item.id))
                          : [...excluded, String(item.id)],
                      )
                    }
                  />
                </td>
                <td>{item.sku}</td>
                <td>{item.quantity}</td>
                <td>{item.requirement || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.data?.length && <p>This inquiry has no items to quote.</p>}
        <p>{selected.length} selected</p>
        <Button onClick={confirm} disabled={!selected.length || busy}>
          {busy ? "Creating snapshot…" : "Confirm and create Quote"}
        </Button>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}

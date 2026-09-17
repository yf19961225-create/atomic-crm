import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  useDataProvider,
  useGetList,
  useGetOne,
  useRefresh,
  type RaRecord,
} from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkflowFields,
  labelFor,
  type Field,
  type Values,
} from "./WorkflowFields";
import {
  Contacts,
  Followups,
  errorMessage,
  formatDate,
  useRelated,
} from "./RelatedRecords";
import {
  deriveFollowupState,
  readRelated,
  saveWorkflowRecord,
  workflowResources,
  type Followup,
  type WorkflowKind,
} from "./workflow";

export type WorkflowConfig = {
  kind: WorkflowKind;
  title: string;
  createLabel?: string;
  statuses: string[];
  fields: Field[];
  extraTabs?: {
    title: string;
    fields?: Field[];
    render?: (record: RaRecord) => React.ReactNode;
  }[];
};

function FollowupCells({
  record,
  kind,
}: {
  record: RaRecord;
  kind: "inquiry" | "outbound";
}) {
  const { data, error } = useRelated(
    kind === "inquiry"
      ? "romiku_website_inquiry_followups"
      : "romiku_outbound_followups",
    kind === "inquiry" ? "inquiry_id" : "outbound_company_id",
    record.id,
  );
  if (!data)
    return (
      <td colSpan={4} className="p-3">
        {error ? "Follow-up data unavailable" : "Loading…"}
      </td>
    );
  const state = deriveFollowupState(data as Followup[], record.status);
  return (
    <>
      <td className="p-3">{formatDate(state.last_contact_at)}</td>
      <td className="p-3">{formatDate(state.next_follow_up_at)}</td>
      <td className="p-3">{state.follow_up_count}</td>
      <td className="p-3">{state.overdue ? "Overdue" : "—"}</td>
    </>
  );
}
function ContactCell({
  record,
  kind,
}: {
  record: RaRecord;
  kind: "outbound" | "customer";
}) {
  const {
    data = [],
    error,
    isPending,
  } = useRelated(
    kind === "outbound"
      ? "romiku_outbound_contacts"
      : "romiku_customer_contacts",
    kind === "outbound" ? "outbound_company_id" : "formal_customer_id",
    record.id,
  );
  const primary =
    data.find((contact) => contact.is_primary && contact.is_active !== false) ||
    data.find((contact) => contact.is_active !== false);
  return (
    <td className="p-3">
      {isPending ? (
        "Loading…"
      ) : error ? (
        "Contacts unavailable"
      ) : (
        <>
          {primary?.name || "—"}
          {data.length > 1 && ` (+${data.length - 1})`}
          <div className="text-muted-foreground text-xs">
            {primary?.whatsapp}
          </div>
        </>
      )}
    </td>
  );
}
export function WorkflowPage({ config }: { config: WorkflowConfig }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("record");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const resource = workflowResources[config.kind];
  const nameKey = config.kind === "inquiry" ? "customer_name" : "name";
  const {
    data = [],
    total,
    isPending,
    error,
    refetch,
  } = useGetList(resource, {
    pagination: { page, perPage: 25 },
    sort: {
      field: config.kind === "inquiry" ? "submitted_at" : "name",
      order: config.kind === "inquiry" ? "DESC" : "ASC",
    },
    filter: {
      ...(status ? { status } : {}),
      ...(search ? { [`${nameKey}@ilike`]: `%${search}%` } : {}),
    },
  });
  const provider = useDataProvider();
  const owners = useQuery({
    queryKey: ["romiku-owners"],
    queryFn: () => readRelated(provider, "sales", {}),
  });
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("record", id);
    else next.delete("record");
    setParams(next);
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{config.title}</h1>
        {config.createLabel && (
          <Button onClick={() => open("new")}>{config.createLabel}</Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        {config.kind === "inquiry"
          ? "Each website submission stays independent. Original values are read-only."
          : config.kind === "outbound"
            ? "Research and outreach stay independent of inquiries and formal customers."
            : "Create customer archives manually when real business is established."}{" "}
        Status changes are manual.
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          Search{" "}
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
          Filter status{" "}
          <select
            className="rounded border p-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {config.statuses.map((value) => (
              <option key={value} value={value}>
                {labelFor(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending && <p>Loading records…</p>}
      {error && (
        <div role="alert">
          Records could not be loaded.{" "}
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                config.kind === "inquiry" ? "Inquiry / customer" : "Company",
                "Country",
                ...(config.kind === "inquiry"
                  ? ["Submitted", "Email"]
                  : ["Primary contact"]),
                ...(config.kind === "outbound"
                  ? ["Brand", "Purchasing categories", "Grade"]
                  : []),
                "Status",
                "Owner",
                ...(config.kind !== "customer"
                  ? [
                      "Last contact",
                      "Next follow-up",
                      "Follow-ups",
                      "Due state",
                    ]
                  : []),
              ].map((title) => (
                <th className="whitespace-nowrap p-3 font-medium" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((record) => (
              <tr key={record.id} className="hover:bg-muted/50 border-t">
                <td className="p-3">
                  <button
                    className="text-primary text-left font-medium underline underline-offset-4"
                    onClick={() => open(String(record.id))}
                  >
                    {config.kind === "inquiry"
                      ? `${record.document_number} · ${record.customer_name}`
                      : record.name}
                  </button>
                </td>
                <td className="p-3">{record.country || "—"}</td>
                {config.kind === "inquiry" ? (
                  <>
                    <td className="p-3">{formatDate(record.submitted_at)}</td>
                    <td className="p-3">{record.email}</td>
                  </>
                ) : (
                  <ContactCell record={record} kind={config.kind} />
                )}
                {config.kind === "outbound" && (
                  <>
                    <td className="p-3">{record.brand_name}</td>
                    <td className="p-3">
                      {record.purchasing_categories?.join(", ")}
                    </td>
                    <td className="p-3">{record.grade}</td>
                  </>
                )}
                <td className="p-3">{labelFor(record.status)}</td>
                <td className="p-3">
                  {record.owner_id
                    ? owners.data?.find(
                        (owner) => owner.user_id === record.owner_id,
                      )?.first_name || "Assigned"
                    : "Unassigned"}
                </td>
                {config.kind !== "customer" && (
                  <FollowupCells record={record} kind={config.kind} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !error && data.length === 0 && (
          <p className="p-6 text-center text-sm">No records found.</p>
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
      <Sheet
        open={!!selected}
        onOpenChange={(isOpen) => {
          if (!isOpen) open(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>
              {selected === "new" ? config.createLabel : config.title}
            </SheetTitle>
            <SheetDescription>
              Manual updates preserve the identity and history of each record.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            {selected && (
              <WorkflowDrawer
                key={selected}
                config={config}
                id={selected}
                onCreated={open}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function WorkflowDrawer({
  config,
  id,
  onCreated,
}: {
  config: WorkflowConfig;
  id: string;
  onCreated: (id: string) => void;
}) {
  const { data, isPending, error } = useGetOne(
    workflowResources[config.kind],
    { id },
    { enabled: id !== "new" },
  );
  if (id === "new")
    return config.createLabel ? (
      <RecordEditor config={config} onCreated={onCreated} />
    ) : (
      <p>Inquiries arrive from the website.</p>
    );
  if (isPending) return <p>Loading record…</p>;
  if (error || !data) return <p role="alert">Could not load this record.</p>;
  return <RecordEditor config={config} record={data} onCreated={onCreated} />;
}
function RecordEditor({
  config,
  record,
  onCreated,
}: {
  config: WorkflowConfig;
  record?: RaRecord;
  onCreated: (id: string) => void;
}) {
  const provider = useDataProvider();
  const refresh = useRefresh();
  const [values, setValues] = useState<Values>(
    record
      ? {
          ...record,
          purchasing_categories: record.purchasing_categories?.join(", "),
        }
      : { status: config.statuses[0] },
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [activeTab, setActiveTab] = useState("Profile");
  const editingRecord =
    activeTab === "Profile" ||
    config.extraTabs?.some((tab) => tab.title === activeTab && tab.fields);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const write = { ...values };
      if (config.kind === "outbound")
        write.purchasing_categories = String(values.purchasing_categories || "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      const result = await saveWorkflowRecord(
        provider,
        config.kind,
        write,
        record,
      );
      refresh();
      setMessage("Record saved.");
      if (!record) onCreated(String(result.data.id));
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      {record && (
        <Button asChild variant="outline">
          <Link
            to={`/quotes/new?source=${config.kind}&sourceId=${encodeURIComponent(record.id)}`}
          >
            Create Quote
          </Link>
        </Button>
      )}
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="Profile">Profile</TabsTrigger>
        {config.extraTabs?.map((tab) => (
          <TabsTrigger key={tab.title} value={tab.title}>
            {tab.title}
          </TabsTrigger>
        ))}
        {record && config.kind !== "inquiry" && (
          <TabsTrigger value="Contacts">Contacts</TabsTrigger>
        )}
        {record && config.kind !== "customer" && (
          <TabsTrigger value="Follow-ups">Follow-ups</TabsTrigger>
        )}
      </TabsList>
      <form onSubmit={submit} className="space-y-4" hidden={!editingRecord}>
        <TabsContent value="Profile" className="space-y-4">
          <WorkflowFields
            fields={config.fields}
            values={values}
            onChange={setValues}
          />
          {record && config.kind === "inquiry" && (
            <p className="text-sm">
              {record.customer_name} · {record.company} · {record.email}
            </p>
          )}
          {config.kind === "customer" && (
            <p className="text-muted-foreground text-sm">
              Source links are advisory history. Linking never moves, merges, or
              converts the source record.
            </p>
          )}
        </TabsContent>
        {config.extraTabs
          ?.filter((tab) => tab.fields)
          .map((tab) => (
            <TabsContent key={tab.title} value={tab.title}>
              <WorkflowFields
                fields={tab.fields!}
                values={values}
                onChange={setValues}
              />
            </TabsContent>
          ))}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </Button>
          {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </div>
      </form>
      {config.extraTabs
        ?.filter((tab) => tab.render)
        .map((tab) => (
          <TabsContent key={tab.title} value={tab.title}>
            {record ? tab.render?.(record) : <p>Save this record first.</p>}
          </TabsContent>
        ))}
      {record && config.kind !== "inquiry" && (
        <TabsContent value="Contacts">
          <Contacts kind={config.kind} id={record.id} />
        </TabsContent>
      )}
      {record && config.kind !== "customer" && (
        <TabsContent value="Follow-ups">
          <Followups kind={config.kind} id={record.id} />
        </TabsContent>
      )}
      {record && config.kind === "customer" && (
        <p className="text-sm">
          <Link className="underline" to="/website-inquiries">
            Open website inquiries to manually link source history
          </Link>
        </p>
      )}
    </Tabs>
  );
}

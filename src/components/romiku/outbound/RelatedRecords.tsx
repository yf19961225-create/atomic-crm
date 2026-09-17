import { useState } from "react";
import {
  useDataProvider,
  useRefresh,
  type Identifier,
  type RaRecord,
} from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  WorkflowFields,
  type Field,
  type Values,
  contactFields,
} from "./WorkflowFields";
import {
  followupMethods,
  readRelated,
  syncNextFollowup,
  type WorkflowKind,
} from "./workflow";

export function useRelated(resource: string, key: string, id: Identifier) {
  const provider = useDataProvider();
  return useQuery({
    queryKey: ["romiku-related", resource, key, id],
    queryFn: () => readRelated(provider, resource, { [key]: id }),
  });
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not save. Your changes are still in the form.";
export const localDateTime = (value = new Date().toISOString()) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

export function RelatedRecords({
  resource,
  parentKey,
  parentId,
  fields,
  noun,
  defaults = {},
  followupKind,
}: {
  resource: string;
  parentKey: string;
  parentId: Identifier;
  fields: Field[];
  noun: string;
  defaults?: Values;
  followupKind?: "inquiry" | "outbound";
}) {
  const provider = useDataProvider();
  const client = useQueryClient();
  const refresh = useRefresh();
  const {
    data = [],
    isPending,
    error,
  } = useRelated(resource, parentKey, parentId);
  const [values, setValues] = useState<Values>(defaults);
  const [editing, setEditing] = useState<RaRecord>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [needsSync, setNeedsSync] = useState(false);
  const resetValues = () =>
    followupKind ? { ...defaults, contacted_at: localDateTime() } : defaults;
  const reload = async () => {
    await client.invalidateQueries({ queryKey: ["romiku-related"] });
    refresh();
  };
  const sync = async () => {
    if (followupKind) await syncNextFollowup(provider, followupKind, parentId);
    setNeedsSync(false);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      // Write only editable fields, never the parent identity from form data.
      const keys = [...new Set(fields.map((field) => field.key.split(".")[0]))];
      const write = Object.fromEntries(
        keys.map((key) => [key, values[key] === "" ? null : values[key]]),
      );
      if (followupKind) {
        write.contacted_at = new Date(
          String(values.contacted_at),
        ).toISOString();
        write.next_follow_up_at = values.next_follow_up_at
          ? new Date(String(values.next_follow_up_at)).toISOString()
          : null;
      }
      const payload = { ...write, [parentKey]: parentId };
      if (editing)
        await provider.update(resource, {
          id: editing.id,
          data: payload,
          previousData: editing,
        });
      else await provider.create(resource, { data: payload });
      setEditing(undefined);
      setValues(resetValues());
      // A retry after a schedule failure must not insert a duplicate follow-up.
      if (followupKind) {
        try {
          await sync();
        } catch (cause) {
          setNeedsSync(true);
          setFailure(
            `Follow-up saved; calendar schedule needs retry. ${errorMessage(cause)}`,
          );
        }
      }
      await reload();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      {isPending && <p>Loading {noun}s…</p>}
      {error && <p role="alert">Could not load {noun}s.</p>}
      {data.length === 0 && !isPending && (
        <p className="text-muted-foreground">No {noun}s yet.</p>
      )}
      <ul className="space-y-3">
        {data.map((record) => (
          <li key={record.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {record.name || record.summary || record.label || record.url}
                </p>
                {record.email && <p>{record.email}</p>}
                {record.whatsapp && <p>{record.whatsapp}</p>}
                {record.is_primary && <p>Primary contact</p>}
                {record.is_active === false && <p>Former / inactive contact</p>}
                {record.contacted_at && (
                  <p>
                    {record.method} · {formatDate(record.contacted_at)} · Next:{" "}
                    {formatDate(record.next_follow_up_at)}
                  </p>
                )}
                {record.url && /^https?:\/\//.test(record.url) && (
                  <a
                    href={record.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {record.source_type}: {record.url}
                  </a>
                )}
                {record.notes && (
                  <p className="whitespace-pre-wrap text-sm">{record.notes}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(record);
                  setValues(
                    followupKind
                      ? {
                          ...record,
                          contacted_at: localDateTime(record.contacted_at),
                          next_follow_up_at: record.next_follow_up_at
                            ? localDateTime(record.next_follow_up_at)
                            : "",
                        }
                      : record,
                  );
                }}
              >
                Edit {record.name || noun}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={save} className="space-y-4 rounded-md border p-4">
        <h3 className="font-medium">
          {editing ? "Edit" : "Add"} {noun}
        </h3>
        <WorkflowFields fields={fields} values={values} onChange={setValues} />
        {failure && <p role="alert">{failure}</p>}
        {needsSync && (
          <Button
            type="button"
            disabled={busy}
            variant="outline"
            onClick={async () => {
              setBusy(true);
              try {
                await sync();
                setFailure("");
                await reload();
              } catch (cause) {
                setFailure(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            Retry calendar schedule
          </Button>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || needsSync}>
            {busy ? "Saving…" : editing ? `Save ${noun}` : `Add ${noun}`}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(undefined);
                setValues(resetValues());
              }}
            >
              Cancel edit
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export function Contacts({
  kind,
  id,
}: {
  kind: "outbound" | "customer";
  id: Identifier;
}) {
  return (
    <RelatedRecords
      resource={
        kind === "outbound"
          ? "romiku_outbound_contacts"
          : "romiku_customer_contacts"
      }
      parentKey={
        kind === "outbound" ? "outbound_company_id" : "formal_customer_id"
      }
      parentId={id}
      fields={contactFields}
      noun="contact"
      defaults={{ is_primary: false, is_active: true, social_urls: {} }}
    />
  );
}

export function Followups({
  kind,
  id,
}: {
  kind: Exclude<WorkflowKind, "customer">;
  id: Identifier;
}) {
  const contacts = useRelated(
    "romiku_outbound_contacts",
    "outbound_company_id",
    kind === "outbound" ? id : "00000000-0000-0000-0000-000000000000",
  );
  // Contact association uses this company's contacts only; it never creates one.
  return (
    <>
      <RelatedRecords
        resource={
          kind === "inquiry"
            ? "romiku_website_inquiry_followups"
            : "romiku_outbound_followups"
        }
        parentKey={kind === "inquiry" ? "inquiry_id" : "outbound_company_id"}
        parentId={id}
        noun="follow-up"
        followupKind={kind}
        defaults={{
          method: "Email",
          contacted_at: localDateTime(),
          next_follow_up_at: "",
          ...(kind === "outbound" ? { contact_id: null } : {}),
        }}
        fields={[
          {
            key: "method",
            label: "Method",
            options: followupMethods,
            required: true,
          },
          {
            key: "summary",
            label: "Summary",
            type: "textarea",
            required: true,
          },
          {
            key: "contacted_at",
            label: "Contacted at",
            type: "datetime-local",
            required: true,
          },
          {
            key: "next_follow_up_at",
            label: "Next follow-up",
            type: "datetime-local",
          },
          { key: "notes", label: "Follow-up notes", type: "textarea" },
          ...(kind === "outbound"
            ? [
                {
                  key: "contact_id",
                  label: "Related contact",
                  choices: (contacts.data || []).map((contact) => ({
                    id: String(contact.id),
                    label: contact.name,
                  })),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

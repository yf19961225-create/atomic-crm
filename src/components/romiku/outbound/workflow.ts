import type { DataProvider, Identifier, RaRecord } from "ra-core";

export const outboundStatuses = [
  "to_develop",
  "contacted",
  "no_reply",
  "replied",
  "communicating",
  "purchase_intent",
  "to_quote",
  "quoted",
  "sampling",
  "paused",
  "invalid",
];
export const inquiryStatuses = [
  "new",
  "pending",
  "following_up",
  "processed",
  "invalid",
];
export const followupMethods = [
  "WhatsApp",
  "Email",
  "Phone",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Other",
];

export type Followup = RaRecord & {
  contacted_at: string;
  next_follow_up_at?: string | null;
};
export function deriveFollowupState(
  followups: Followup[],
  status: string,
  now = new Date(),
) {
  const latest = [...followups].sort(
    (a, b) =>
      Date.parse(b.contacted_at) - Date.parse(a.contacted_at) ||
      String(b.id).localeCompare(String(a.id)),
  )[0];
  const next = latest?.next_follow_up_at || null;
  return {
    last_contact_at: latest?.contacted_at || null,
    next_follow_up_at: next,
    follow_up_count: followups.length,
    overdue:
      !!next &&
      Date.parse(next) < now.getTime() &&
      !["paused", "invalid", "processed"].includes(status),
  };
}

// Paginate explicitly: a company's history must not silently stop at page one.
export async function readRelated(
  provider: DataProvider,
  resource: string,
  filter: Record<string, unknown>,
) {
  const records: RaRecord[] = [];
  for (let page = 1; ; page++) {
    const result = await provider.getList(resource, {
      filter,
      pagination: { page, perPage: 100 },
      sort: { field: "id", order: "ASC" },
    });
    records.push(...result.data);
    if (
      result.data.length < 100 ||
      (result.total !== undefined && records.length >= result.total)
    )
      return records;
  }
}

export type WorkflowKind = "inquiry" | "outbound" | "customer";
export const workflowResources = {
  inquiry: "romiku_website_inquiries",
  outbound: "romiku_outbound_companies",
  customer: "romiku_formal_customers",
} as const;

const writableFields = {
  inquiry: [
    "status",
    "owner_id",
    "processing_notes",
    "outbound_company_id",
    "formal_customer_id",
  ],
  outbound: [
    "name",
    "brand_name",
    "country",
    "city",
    "address",
    "registration_number",
    "customer_type",
    "website",
    "social_urls",
    "purchasing_categories",
    "business_intelligence",
    "grade",
    "status",
    "owner_id",
    "notes",
  ],
  customer: [
    "name",
    "country",
    "status",
    "source_outbound_company_id",
    "logistics",
    "requirements",
    "owner_id",
    "notes",
  ],
};

export function toWorkflowWrite(
  kind: WorkflowKind,
  values: Record<string, unknown>,
) {
  if (kind !== "inquiry" && !String(values.name || "").trim())
    throw new Error("Company / customer name is required.");
  const allowed =
    kind === "outbound"
      ? outboundStatuses
      : kind === "inquiry"
        ? inquiryStatuses
        : undefined;
  if (allowed && !allowed.includes(String(values.status)))
    throw new Error("Choose an approved status.");
  return Object.fromEntries(
    writableFields[kind]
      .filter((key) => key in values)
      .map((key) => [key, values[key] === "" ? null : values[key]]),
  );
}

export async function saveWorkflowRecord(
  provider: DataProvider,
  kind: WorkflowKind,
  values: Record<string, unknown>,
  previous?: RaRecord,
) {
  const data = toWorkflowWrite(kind, values);
  const resource = workflowResources[kind];
  return previous
    ? provider.update(resource, {
        id: previous.id,
        data,
        previousData: previous,
      })
    : provider.create(resource, { data });
}

export async function syncNextFollowup(
  provider: DataProvider,
  kind: "inquiry" | "outbound",
  id: Identifier,
) {
  const resource =
    kind === "inquiry"
      ? "romiku_website_inquiry_followups"
      : "romiku_outbound_followups";
  const key = kind === "inquiry" ? "inquiry_id" : "outbound_company_id";
  const history = await readRelated(provider, resource, { [key]: id });
  const state = deriveFollowupState(history as Followup[], "");
  const { data: parent } = await provider.getOne(workflowResources[kind], {
    id,
  });
  await provider.update(workflowResources[kind], {
    id,
    data: { next_follow_up_at: state.next_follow_up_at },
    previousData: parent,
  });
}

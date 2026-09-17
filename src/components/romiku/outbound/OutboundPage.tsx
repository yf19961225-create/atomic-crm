import { WorkflowPage, type WorkflowConfig } from "./WorkflowPage";
import { ownerField } from "./WorkflowFields";
import { RelatedRecords } from "./RelatedRecords";
import { outboundStatuses } from "./workflow";

const config: WorkflowConfig = {
  kind: "outbound",
  title: "Outbound Development",
  createLabel: "New outbound company",
  statuses: outboundStatuses,
  fields: [
    { key: "name", label: "Company name", required: true },
    { key: "brand_name", label: "Brand / commercial name" },
    { key: "registration_number", label: "Registration / RUC / NIT" },
    { key: "country", label: "Country" },
    { key: "city", label: "City" },
    { key: "address", label: "Address" },
    { key: "customer_type", label: "Company type" },
    { key: "website", label: "Website", type: "url" },
    { key: "grade", label: "Value level", options: ["A", "B", "C", "D"] },
    {
      key: "status",
      label: "Status",
      options: outboundStatuses,
      required: true,
    },
    ownerField,
    {
      key: "purchasing_categories",
      label: "Purchasing categories (comma separated)",
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  extraTabs: [
    {
      title: "Research",
      fields: [
        {
          key: "business_intelligence.operations",
          label: "Establishment / operations",
        },
        {
          key: "business_intelligence.purchasing_scale",
          label: "Purchasing scale / frequency",
        },
        {
          key: "business_intelligence.previous_suppliers",
          label: "Previous suppliers",
        },
        {
          key: "business_intelligence.china_suppliers",
          label: "China suppliers / sourcing companies",
        },
        {
          key: "business_intelligence.recent_imports",
          label: "Recent import information",
          type: "textarea",
        },
        {
          key: "business_intelligence.entry_angle",
          label: "ROMIKU advantages / entry angle",
          type: "textarea",
        },
        ...["instagram", "facebook", "tiktok", "linkedin", "other"].map(
          (key) => ({
            key: `social_urls.${key}`,
            label: `${key} URL`,
            type: "url" as const,
          }),
        ),
      ],
    },
    {
      title: "Sources",
      render: (record) => (
        <RelatedRecords
          resource="romiku_source_urls"
          parentKey="outbound_company_id"
          parentId={record.id}
          noun="source URL"
          defaults={{ source_type: "website" }}
          fields={[
            {
              key: "source_type",
              label: "Source type",
              required: true,
              options: [
                "website",
                "social",
                "customs",
                "directory",
                "exhibition",
                "other",
              ],
            },
            { key: "url", label: "Source URL", type: "url", required: true },
            { key: "label", label: "Source label" },
            { key: "notes", label: "Source notes", type: "textarea" },
          ]}
        />
      ),
    },
  ],
};
export const OutboundPage = () => <WorkflowPage config={config} />;

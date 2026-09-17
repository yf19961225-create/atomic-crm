import { type RaRecord } from "ra-core";
import { WorkflowPage, type WorkflowConfig } from "../outbound/WorkflowPage";
import { ownerField } from "../outbound/WorkflowFields";
import { formatDate, useRelated } from "../outbound/RelatedRecords";
import { inquiryStatuses } from "../outbound/workflow";

function OriginalSubmission({ record }: { record: RaRecord }) {
  const {
    data = [],
    isPending,
    error,
  } = useRelated("romiku_website_inquiry_items", "inquiry_id", record.id);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2">
        {[
          "document_number",
          "customer_name",
          "company",
          "email",
          "whatsapp",
          "country",
          "message",
        ].map((key) => (
          <div key={key}>
            <dt className="text-muted-foreground text-sm">
              {key.replaceAll("_", " ")}
            </dt>
            <dd className="whitespace-pre-wrap">{record[key] || "—"}</dd>
          </div>
        ))}
      </dl>
      <p>Submitted: {formatDate(record.submitted_at)}</p>
      <h3 className="font-medium">Original requested items</h3>
      {isPending && <p>Loading original items…</p>}
      {error && <p role="alert">Original items could not be loaded.</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Quantity</th>
            <th>Requirement</th>
            <th>Product match</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="py-3">{item.sku}</td>
              <td>{item.quantity}</td>
              <td className="whitespace-pre-wrap">{item.requirement}</td>
              <td>Product match: {item.match_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary className="cursor-pointer">Raw website payload</summary>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded border p-3 text-xs">
          {JSON.stringify(record.raw_payload, null, 2)}
        </pre>
      </details>
      <p className="text-muted-foreground text-sm">
        Original SKU, quantity, requirement and raw submission remain unchanged
        even if product matching fails.
      </p>
    </div>
  );
}
const config: WorkflowConfig = {
  kind: "inquiry",
  title: "Website Inquiries",
  statuses: inquiryStatuses,
  fields: [
    {
      key: "status",
      label: "Status",
      required: true,
      options: inquiryStatuses,
    },
    ownerField,
    { key: "processing_notes", label: "Processing notes", type: "textarea" },
    {
      key: "outbound_company_id",
      label: "Related outbound company",
      reference: "romiku_outbound_companies",
    },
    {
      key: "formal_customer_id",
      label: "Related formal customer",
      reference: "romiku_formal_customers",
    },
  ],
  extraTabs: [
    {
      title: "Original submission",
      render: (record) => <OriginalSubmission record={record} />,
    },
  ],
};
export const InquiryPage = () => <WorkflowPage config={config} />;

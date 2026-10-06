import type { RaRecord } from "ra-core";
import { inquiryFieldLabel } from "../relationshipLabels";
import { formatDate } from "../outbound/RelatedRecords";

export function InquirySummary({ record }: { record: RaRecord }) {
  return (
    <dl
      aria-label="询盘基本信息"
      className="mb-5 grid min-w-0 grid-cols-2 gap-3 rounded-md border p-3"
    >
      {[
        "document_number",
        "customer_name",
        "company",
        "country",
        "email",
        "whatsapp",
        "submitted_at",
        "message",
      ].map((key) => (
        <div
          key={key}
          className={key === "message" ? "col-span-2 min-w-0" : "min-w-0"}
        >
          <dt className="text-muted-foreground text-xs">
            {key === "submitted_at" ? "提交时间" : inquiryFieldLabel(key)}
          </dt>
          <dd className="whitespace-pre-wrap break-words text-sm">
            {key === "submitted_at"
              ? formatDate(record[key])
              : record[key] || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

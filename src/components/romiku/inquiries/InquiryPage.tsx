import { type RaRecord } from "ra-core";
import { WorkflowPage, type WorkflowConfig } from "../outbound/WorkflowPage";
import { ownerField } from "../outbound/WorkflowFields";
import { formatDate, useRelated } from "../outbound/RelatedRecords";
import { inquiryStatuses } from "../outbound/workflow";
import {
  inquiryFieldLabel,
  relationshipStatusLabel,
} from "../relationshipLabels";

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
              {inquiryFieldLabel(key)}
            </dt>
            <dd className="whitespace-pre-wrap">{record[key] || "—"}</dd>
          </div>
        ))}
      </dl>
      <p>提交时间：{formatDate(record.submitted_at)}</p>
      <h3 className="font-medium">原始需求商品</h3>
      {isPending && <p>正在加载原始商品…</p>}
      {error && <p role="alert">无法加载原始商品。</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>SKU</th>
            <th>数量</th>
            <th>需求</th>
            <th>商品匹配</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="py-3">{item.sku}</td>
              <td>{item.quantity}</td>
              <td className="whitespace-pre-wrap">{item.requirement}</td>
              <td>商品匹配：{relationshipStatusLabel(item.match_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary className="cursor-pointer">网站原始载荷</summary>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded border p-3 text-xs">
          {JSON.stringify(record.raw_payload, null, 2)}
        </pre>
      </details>
      <p className="text-muted-foreground text-sm">
        即使商品匹配失败，原始 SKU、数量、需求和提交载荷也会保持不变。
      </p>
    </div>
  );
}
const config: WorkflowConfig = {
  kind: "inquiry",
  title: "网站询盘",
  statuses: inquiryStatuses,
  fields: [
    {
      key: "status",
      label: "状态",
      required: true,
      options: inquiryStatuses,
    },
    ownerField,
    { key: "processing_notes", label: "处理备注", type: "textarea" },
    {
      key: "outbound_company_id",
      label: "关联外贸开发公司",
      reference: "romiku_outbound_companies",
    },
    {
      key: "formal_customer_id",
      label: "关联正式客户",
      reference: "romiku_formal_customers",
    },
  ],
  extraTabs: [
    {
      title: "原始提交",
      render: (record) => <OriginalSubmission record={record} />,
    },
  ],
};
export const InquiryPage = () => <WorkflowPage config={config} />;

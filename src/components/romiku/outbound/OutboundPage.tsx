import { WorkflowPage, type WorkflowConfig } from "./WorkflowPage";
import { ownerField } from "./WorkflowFields";
import { RelatedRecords } from "./RelatedRecords";
import { outboundStatuses } from "./workflow";

const config: WorkflowConfig = {
  kind: "outbound",
  title: "外贸开发",
  createLabel: "新建外贸开发公司",
  statuses: outboundStatuses,
  fields: [
    { key: "name", label: "公司名称", required: true },
    { key: "brand_name", label: "品牌／商业名称" },
    { key: "registration_number", label: "注册号／RUC／NIT" },
    { key: "country", label: "国家／地区" },
    { key: "city", label: "城市" },
    { key: "address", label: "地址" },
    { key: "customer_type", label: "公司类型" },
    { key: "website", label: "网站", type: "url" },
    { key: "grade", label: "价值等级", options: ["A", "B", "C", "D"] },
    {
      key: "status",
      label: "状态",
      options: outboundStatuses,
      required: true,
    },
    ownerField,
    {
      key: "purchasing_categories",
      label: "采购品类（以逗号分隔）",
    },
    { key: "notes", label: "备注", type: "textarea" },
  ],
  extraTabs: [
    {
      title: "调研",
      fields: [
        {
          key: "business_intelligence.operations",
          label: "成立／运营情况",
        },
        {
          key: "business_intelligence.purchasing_scale",
          label: "采购规模／频率",
        },
        {
          key: "business_intelligence.previous_suppliers",
          label: "历史供应商",
        },
        {
          key: "business_intelligence.china_suppliers",
          label: "中国供应商／采购公司",
        },
        {
          key: "business_intelligence.recent_imports",
          label: "近期进口信息",
          type: "textarea",
        },
        {
          key: "business_intelligence.entry_angle",
          label: "ROMIKU 优势／切入角度",
          type: "textarea",
        },
        ...["instagram", "facebook", "tiktok", "linkedin", "other"].map(
          (key) => ({
            key: `social_urls.${key}`,
            label: `${key === "other" ? "其他" : key} 链接`,
            type: "url" as const,
          }),
        ),
      ],
    },
    {
      title: "来源",
      render: (record) => (
        <RelatedRecords
          resource="romiku_source_urls"
          parentKey="outbound_company_id"
          parentId={record.id}
          noun="来源链接"
          defaults={{ source_type: "website" }}
          fields={[
            {
              key: "source_type",
              label: "来源类型",
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
            { key: "url", label: "来源链接", type: "url", required: true },
            { key: "label", label: "来源名称" },
            { key: "notes", label: "来源备注", type: "textarea" },
          ]}
        />
      ),
    },
  ],
};
export const OutboundPage = () => <WorkflowPage config={config} />;

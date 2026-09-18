import { WorkflowPage, type WorkflowConfig } from "../outbound/WorkflowPage";
import { ownerField } from "../outbound/WorkflowFields";
import { CustomerHistory } from "./CustomerHistory";

const statuses = ["active", "inactive"];
const config: WorkflowConfig = {
  kind: "customer",
  title: "正式客户",
  createLabel: "新建正式客户",
  statuses,
  fields: [
    { key: "name", label: "客户名称", required: true },
    { key: "country", label: "国家／地区" },
    { key: "status", label: "状态", options: statuses, required: true },
    ownerField,
    {
      key: "source_outbound_company_id",
      label: "来源外贸开发公司",
      reference: "romiku_outbound_companies",
    },
    { key: "notes", label: "备注", type: "textarea" },
  ],
  extraTabs: [
    {
      title: "来源历史",
      render: (record) => <CustomerHistory record={record} />,
    },
    {
      title: "物流",
      fields: [
        { key: "logistics.receiving_company", label: "收货公司" },
        { key: "logistics.receiving_contact", label: "收货联系人" },
        { key: "logistics.receiving_phone", label: "收货联系电话" },
        {
          key: "logistics.delivery_address",
          label: "默认收货地址",
          type: "textarea",
        },
        {
          key: "logistics.forwarder_address",
          label: "仓库／货代地址",
          type: "textarea",
        },
        {
          key: "logistics.tax_information",
          label: "清关／税务信息",
          type: "textarea",
        },
        {
          key: "logistics.preference",
          label: "物流偏好",
          type: "textarea",
        },
      ],
    },
    {
      title: "要求",
      fields: [
        {
          key: "requirements.packaging",
          label: "包装要求",
          type: "textarea",
        },
        {
          key: "requirements.shipping_marks",
          label: "唛头要求",
          type: "textarea",
        },
        {
          key: "requirements.shipping_mark_image_url",
          label: "唛头图片链接",
          type: "url",
        },
        {
          key: "requirements.product_labels",
          label: "产品标签要求",
          type: "textarea",
        },
        {
          key: "requirements.packing_preference",
          label: "装箱偏好",
          type: "textarea",
        },
        {
          key: "requirements.shipping_documents",
          label: "所需运输单证",
          type: "textarea",
        },
      ],
    },
  ],
};
export const CustomerPage = () => <WorkflowPage config={config} />;

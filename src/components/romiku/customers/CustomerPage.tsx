import { WorkflowPage, type WorkflowConfig } from "../outbound/WorkflowPage";
import { ownerField } from "../outbound/WorkflowFields";
import { CustomerHistory } from "./CustomerHistory";

const statuses = ["active", "inactive"];
const config: WorkflowConfig = {
  kind: "customer",
  title: "Formal Customers",
  createLabel: "New formal customer",
  statuses,
  fields: [
    { key: "name", label: "Customer name", required: true },
    { key: "country", label: "Country" },
    { key: "status", label: "Status", options: statuses, required: true },
    ownerField,
    {
      key: "source_outbound_company_id",
      label: "Source outbound company",
      reference: "romiku_outbound_companies",
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  extraTabs: [
    {
      title: "Source history",
      render: (record) => <CustomerHistory record={record} />,
    },
    {
      title: "Logistics",
      fields: [
        { key: "logistics.receiving_company", label: "Receiving company" },
        { key: "logistics.receiving_contact", label: "Receiving contact" },
        { key: "logistics.receiving_phone", label: "Receiving phone" },
        {
          key: "logistics.delivery_address",
          label: "Default delivery address",
          type: "textarea",
        },
        {
          key: "logistics.forwarder_address",
          label: "Warehouse / freight-forwarder address",
          type: "textarea",
        },
        {
          key: "logistics.tax_information",
          label: "Customs / tax information",
          type: "textarea",
        },
        {
          key: "logistics.preference",
          label: "Logistics preference",
          type: "textarea",
        },
      ],
    },
    {
      title: "Requirements",
      fields: [
        {
          key: "requirements.packaging",
          label: "Packaging requirements",
          type: "textarea",
        },
        {
          key: "requirements.shipping_marks",
          label: "Shipping-mark requirements",
          type: "textarea",
        },
        {
          key: "requirements.shipping_mark_image_url",
          label: "Shipping-mark image URL",
          type: "url",
        },
        {
          key: "requirements.product_labels",
          label: "Product-label requirements",
          type: "textarea",
        },
        {
          key: "requirements.packing_preference",
          label: "Packing preference",
          type: "textarea",
        },
        {
          key: "requirements.shipping_documents",
          label: "Required shipping documents",
          type: "textarea",
        },
      ],
    },
  ],
};
export const CustomerPage = () => <WorkflowPage config={config} />;

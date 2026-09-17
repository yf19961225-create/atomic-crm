import { Resource } from "ra-core";
import { InquiryPage } from "./inquiries/InquiryPage";
import { OutboundPage } from "./outbound/OutboundPage";
import { CustomerPage } from "./customers/CustomerPage";
import { QuoteList } from "./quotes/QuotePages";
import {
  ProductExtensionCreate,
  ProductExtensionEdit,
  ProductSupplierCreate,
  ProductSupplierEdit,
  ProcurementCostCreate,
} from "./products";
import {
  SupplierContactCreate,
  SupplierContactEdit,
  SupplierCreate,
  SupplierEdit,
  SupplierList,
} from "./suppliers";
export const RomikuResources = () => (
  <>
    <Resource
      name="romiku_production_orders"
      recordRepresentation="document_number"
    />
    <Resource name="romiku_production_items" />
    <Resource name="romiku_production_followups" />
    <Resource
      name="romiku_packing_lists"
      recordRepresentation="document_number"
    />
    <Resource name="romiku_packing_items" />
    <Resource name="romiku_packing_totals" />
    <Resource name="romiku_order_item_remaining" />
    <Resource
      name="romiku_quotes"
      list={QuoteList}
      recordRepresentation="document_number"
    />
    <Resource name="romiku_quote_items" />
    <Resource name="romiku_quote_totals" />
    <Resource
      name="romiku_website_inquiries"
      list={InquiryPage}
      recordRepresentation="document_number"
    />
    <Resource name="romiku_website_inquiry_items" />
    <Resource name="romiku_website_inquiry_followups" />
    <Resource
      name="romiku_outbound_companies"
      list={OutboundPage}
      recordRepresentation="name"
    />
    <Resource name="romiku_outbound_contacts" />
    <Resource name="romiku_outbound_followups" />
    <Resource name="romiku_source_urls" />
    <Resource
      name="romiku_formal_customers"
      list={CustomerPage}
      recordRepresentation="name"
    />
    <Resource name="romiku_customer_contacts" />
    <Resource
      name="romiku_suppliers"
      list={SupplierList}
      create={SupplierCreate}
      edit={SupplierEdit}
      recordRepresentation="name"
    />
    <Resource
      name="romiku_supplier_contacts"
      create={SupplierContactCreate}
      edit={SupplierContactEdit}
      recordRepresentation="name"
    />
    <Resource
      name="romiku_product_extensions"
      create={ProductExtensionCreate}
      edit={ProductExtensionEdit}
      recordRepresentation="sku"
    />
    <Resource
      name="romiku_product_suppliers"
      create={ProductSupplierCreate}
      edit={ProductSupplierEdit}
      recordRepresentation="sku"
    />
    <Resource
      name="romiku_procurement_cost_history"
      create={ProcurementCostCreate}
      recordRepresentation="cost"
    />
    <Resource name="romiku_current_reference_cost" />
  </>
);

export const romikuResources = <RomikuResources />;

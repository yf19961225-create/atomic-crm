import { Resource } from "ra-core";
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

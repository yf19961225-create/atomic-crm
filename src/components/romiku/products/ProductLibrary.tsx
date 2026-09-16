import { Link } from "react-router";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { EditButton } from "@/components/admin/edit-button";
import { List } from "@/components/admin/list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ProductExtensionsList = () => (
  <List
    resource="romiku_product_extensions"
    title={false}
    sort={{ field: "sku", order: "ASC" }}
    actions={<CreateButton label="New extension" />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="sku" />
      <DataTable.Col source="sanity_product_id" label="Sanity product ID" />
      <DataTable.Col source="internal_notes" />
      <DataTable.Col label="">
        <EditButton label="Edit extension" />
      </DataTable.Col>
    </DataTable>
  </List>
);

const ProductSuppliersList = () => (
  <List
    resource="romiku_product_suppliers"
    title={false}
    sort={{ field: "sku", order: "ASC" }}
    actions={<CreateButton label="New product supplier" />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="sku" />
      <DataTable.Col source="supplier_item_number" />
      <DataTable.Col source="moq" />
      <DataTable.Col source="lead_days" />
      <DataTable.Col source="preferred" />
      <DataTable.Col source="active" />
      <DataTable.Col label="">
        <EditButton label="Edit sourcing" />
      </DataTable.Col>
    </DataTable>
  </List>
);

const ReferenceCostsList = () => (
  <List
    resource="romiku_procurement_cost_history"
    title={false}
    sort={{ field: "effective_date", order: "DESC" }}
    actions={<CreateButton label="New reference cost" />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="product_supplier_id" label="Product supplier" />
      <DataTable.Col source="cost" />
      <DataTable.Col source="currency" />
      <DataTable.Col source="effective_date" />
      <DataTable.Col source="source_type" label="Source" />
      <DataTable.Col source="source_note" />
    </DataTable>
  </List>
);

export const ProductLibrary = () => (
  <section aria-labelledby="product-library-heading" className="space-y-4">
    <div>
      <h1
        id="product-library-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        Product library
      </h1>
      <p className="text-muted-foreground">
        CRM-owned product notes and supplier sourcing. Product masters remain
        read-only in Sanity.
      </p>
    </div>
    <Tabs defaultValue="extensions">
      <TabsList>
        <TabsTrigger value="extensions">Extensions</TabsTrigger>
        <TabsTrigger value="suppliers">Product suppliers</TabsTrigger>
        <TabsTrigger value="costs">Reference costs</TabsTrigger>
      </TabsList>
      <TabsContent value="extensions">
        <ProductExtensionsList />
      </TabsContent>
      <TabsContent value="suppliers">
        <ProductSuppliersList />
      </TabsContent>
      <TabsContent value="costs">
        <ReferenceCostsList />
      </TabsContent>
    </Tabs>
    <Link to="/suppliers" className="text-sm text-primary underline">
      Manage suppliers
    </Link>
  </section>
);

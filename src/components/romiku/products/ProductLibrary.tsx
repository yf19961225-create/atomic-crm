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
    actions={<CreateButton label="新建扩展信息" />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="sku" />
      <DataTable.Col source="sanity_product_id" label="Sanity 产品 ID" />
      <DataTable.Col source="internal_notes" label="内部备注" />
      <DataTable.Col label="">
        <EditButton label="编辑扩展信息" />
      </DataTable.Col>
    </DataTable>
  </List>
);

const ProductSuppliersList = () => (
  <List
    resource="romiku_product_suppliers"
    title={false}
    sort={{ field: "sku", order: "ASC" }}
    actions={<CreateButton label="新建产品供应商" />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="sku" />
      <DataTable.Col source="supplier_item_number" label="供应商货号" />
      <DataTable.Col source="moq" label="最小起订量" />
      <DataTable.Col source="lead_days" label="交期（天）" />
      <DataTable.Col source="preferred" label="首选" />
      <DataTable.Col source="active" label="启用" />
      <DataTable.Col label="">
        <EditButton label="编辑采购信息" />
      </DataTable.Col>
    </DataTable>
  </List>
);

const ReferenceCostsList = () => (
  <List
    resource="romiku_procurement_cost_history"
    title={false}
    sort={{ field: "effective_date", order: "DESC" }}
    actions={<CreateButton label="新建参考成本" />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="product_supplier_id" label="产品供应商" />
      <DataTable.Col source="cost" label="成本" />
      <DataTable.Col source="currency" label="币种" />
      <DataTable.Col source="effective_date" label="生效日期" />
      <DataTable.Col source="source_type" label="来源" />
      <DataTable.Col source="source_note" label="来源备注" />
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
        产品库
      </h1>
      <p className="text-muted-foreground">
        由 CRM 管理产品备注和供应商采购信息；产品主数据在 Sanity 中保持只读。
      </p>
    </div>
    <Tabs defaultValue="extensions">
      <TabsList>
        <TabsTrigger value="extensions">扩展信息</TabsTrigger>
        <TabsTrigger value="suppliers">产品供应商</TabsTrigger>
        <TabsTrigger value="costs">参考成本</TabsTrigger>
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
      管理供应商
    </Link>
  </section>
);

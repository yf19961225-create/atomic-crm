import { Link } from "react-router";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { EditButton } from "@/components/admin/edit-button";
import { List } from "@/components/admin/list";
import { Button } from "@/components/ui/button";

const SupplierActions = () => (
  <div className="flex gap-2">
    <Button asChild variant="outline">
      <Link to="/supplier-contacts">联系人</Link>
    </Button>
    <CreateButton label="新建供应商" />
  </div>
);

export const SupplierList = () => (
  <List
    resource="romiku_suppliers"
    title="供应商"
    sort={{ field: "name", order: "ASC" }}
    actions={<SupplierActions />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="name" label="供应商名称" />
      <DataTable.Col source="region" label="地区" />
      <DataTable.Col source="grade" label="等级" />
      <DataTable.Col source="status" label="状态" />
      <DataTable.Col source="default_lead_days" label="默认交期（天）" />
      <DataTable.Col label="">
        <EditButton label="编辑供应商" />
      </DataTable.Col>
    </DataTable>
  </List>
);

export const SupplierContactList = () => (
  <List
    resource="romiku_supplier_contacts"
    title="供应商联系人"
    sort={{ field: "name", order: "ASC" }}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="name" label="姓名" />
      <DataTable.Col source="title" label="职位" />
      <DataTable.Col source="department" label="部门" />
      <DataTable.Col source="email" label="邮箱" />
      <DataTable.Col source="phone" label="电话" />
      <DataTable.Col source="is_primary" label="主要联系人" />
      <DataTable.Col label="">
        <EditButton label="编辑联系人" />
      </DataTable.Col>
    </DataTable>
  </List>
);

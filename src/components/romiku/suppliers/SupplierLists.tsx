import { Link } from "react-router";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { EditButton } from "@/components/admin/edit-button";
import { List } from "@/components/admin/list";
import { Button } from "@/components/ui/button";

const SupplierActions = () => (
  <div className="flex gap-2">
    <Button asChild variant="outline">
      <Link to="/supplier-contacts">Contacts</Link>
    </Button>
    <CreateButton label="New supplier" />
  </div>
);

export const SupplierList = () => (
  <List
    resource="romiku_suppliers"
    title="Suppliers"
    sort={{ field: "name", order: "ASC" }}
    actions={<SupplierActions />}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="name" />
      <DataTable.Col source="region" />
      <DataTable.Col source="grade" />
      <DataTable.Col source="status" />
      <DataTable.Col source="default_lead_days" label="Default lead days" />
      <DataTable.Col label="">
        <EditButton label="Edit supplier" />
      </DataTable.Col>
    </DataTable>
  </List>
);

export const SupplierContactList = () => (
  <List
    resource="romiku_supplier_contacts"
    title="Supplier contacts"
    sort={{ field: "name", order: "ASC" }}
  >
    <DataTable bulkActionButtons={false}>
      <DataTable.Col source="name" />
      <DataTable.Col source="title" />
      <DataTable.Col source="department" />
      <DataTable.Col source="email" />
      <DataTable.Col source="phone" />
      <DataTable.Col source="is_primary" label="Primary" />
      <DataTable.Col label="">
        <EditButton label="Edit contact" />
      </DataTable.Col>
    </DataTable>
  </List>
);

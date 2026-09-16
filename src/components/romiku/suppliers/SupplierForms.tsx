import { CreateBase, EditBase, Form } from "ra-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormToolbar } from "@/components/atomic-crm/layout/FormToolbar";
import { SupplierContactInputs } from "./SupplierContactInputs";
import { SupplierInputs } from "./SupplierInputs";

const SupplierFormCard = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <Card className="max-w-4xl">
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <Form className="flex flex-col gap-4">
        {children}
        <FormToolbar />
      </Form>
    </CardContent>
  </Card>
);

export const SupplierCreate = () => (
  <CreateBase resource="romiku_suppliers" redirect="/suppliers">
    <SupplierFormCard title="New supplier">
      <SupplierInputs />
    </SupplierFormCard>
  </CreateBase>
);

export const SupplierEdit = () => (
  <EditBase resource="romiku_suppliers" redirect="/suppliers">
    <SupplierFormCard title="Edit supplier">
      <SupplierInputs />
    </SupplierFormCard>
  </EditBase>
);

export const SupplierContactCreate = () => (
  <CreateBase resource="romiku_supplier_contacts" redirect="/supplier-contacts">
    <SupplierFormCard title="New supplier contact">
      <SupplierContactInputs />
    </SupplierFormCard>
  </CreateBase>
);

export const SupplierContactEdit = () => (
  <EditBase resource="romiku_supplier_contacts" redirect="/supplier-contacts">
    <SupplierFormCard title="Edit supplier contact">
      <SupplierContactInputs />
    </SupplierFormCard>
  </EditBase>
);

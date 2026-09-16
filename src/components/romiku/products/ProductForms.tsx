import { CreateBase, EditBase, Form } from "ra-core";
import { FormToolbar } from "@/components/atomic-crm/layout/FormToolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  toProductExtensionWrite,
  toProductSupplierWrite,
  toProcurementCostWrite,
} from "./productSourcing";
import { ProductExtensionInputs } from "./ProductExtensionInputs";
import { ProductSupplierInputs } from "./ProductSupplierInputs";
import { ProcurementCostInputs } from "./ProcurementCostInputs";
import { SanityProductSourceProvider } from "./sanityProductSource";
import { createRomikuSanityProductSource } from "./romikuSanityProductSource";

const ProductFormCard = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <SanityProductSourceProvider source={createRomikuSanityProductSource()}>
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
  </SanityProductSourceProvider>
);

export const ProductExtensionCreate = () => (
  <CreateBase
    resource="romiku_product_extensions"
    redirect="/product-library"
    transform={toProductExtensionWrite}
  >
    <ProductFormCard title="New product extension">
      <ProductExtensionInputs />
    </ProductFormCard>
  </CreateBase>
);

export const ProductExtensionEdit = () => (
  <EditBase
    resource="romiku_product_extensions"
    redirect="/product-library"
    transform={toProductExtensionWrite}
  >
    <ProductFormCard title="Edit product extension">
      <ProductExtensionInputs />
    </ProductFormCard>
  </EditBase>
);

export const ProductSupplierCreate = () => (
  <CreateBase
    resource="romiku_product_suppliers"
    redirect="/product-library"
    transform={toProductSupplierWrite}
  >
    <ProductFormCard title="New product supplier">
      <ProductSupplierInputs />
    </ProductFormCard>
  </CreateBase>
);

export const ProductSupplierEdit = () => (
  <EditBase
    resource="romiku_product_suppliers"
    redirect="/product-library"
    transform={toProductSupplierWrite}
  >
    <ProductFormCard title="Edit product supplier">
      <ProductSupplierInputs />
    </ProductFormCard>
  </EditBase>
);

export const ProcurementCostCreate = () => (
  <CreateBase
    resource="romiku_procurement_cost_history"
    redirect="/product-library"
    transform={toProcurementCostWrite}
  >
    <ProductFormCard title="New reference cost">
      <ProcurementCostInputs />
    </ProductFormCard>
  </CreateBase>
);

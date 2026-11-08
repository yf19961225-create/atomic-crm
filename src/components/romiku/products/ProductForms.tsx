import { useState } from "react";
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
    <Card className="ds-form-page max-w-4xl">
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

export const ProductExtensionCreate = () => {
  const [saveFailed, setSaveFailed] = useState(false);
  return (
    <CreateBase
      resource="romiku_product_extensions"
      redirect="/product-library"
      transform={toProductExtensionWrite}
      mutationOptions={{
        onMutate: () => setSaveFailed(false),
        onError: () => setSaveFailed(true),
      }}
    >
      <ProductFormCard title="新建产品扩展信息">
        {saveFailed && (
          <p role="alert" className="text-destructive">
            保存失败，输入内容已保留。请检查权限或网络后重试。
          </p>
        )}
        <ProductExtensionInputs />
      </ProductFormCard>
    </CreateBase>
  );
};

export const ProductExtensionEdit = () => {
  const [saveFailed, setSaveFailed] = useState(false);
  return (
    <EditBase
      resource="romiku_product_extensions"
      redirect="/product-library"
      transform={toProductExtensionWrite}
      mutationMode="pessimistic"
      mutationOptions={{
        onMutate: () => setSaveFailed(false),
        onError: () => setSaveFailed(true),
      }}
    >
      <ProductFormCard title="编辑产品扩展信息">
        {saveFailed && (
          <p role="alert" className="text-destructive">
            保存失败，修改内容已保留。请检查权限或网络后重试。
          </p>
        )}
        <ProductExtensionInputs />
      </ProductFormCard>
    </EditBase>
  );
};

export const ProductSupplierCreate = () => {
  const [saveFailed, setSaveFailed] = useState(false);
  return (
    <CreateBase
      resource="romiku_product_suppliers"
      redirect="/product-library"
      transform={toProductSupplierWrite}
      mutationOptions={{
        onMutate: () => setSaveFailed(false),
        onError: () => setSaveFailed(true),
      }}
    >
      <ProductFormCard title="新建产品供应商">
        {saveFailed && (
          <p role="alert" className="text-destructive">
            保存失败，输入内容已保留。请检查权限或网络后重试。
          </p>
        )}
        <ProductSupplierInputs />
      </ProductFormCard>
    </CreateBase>
  );
};

export const ProductSupplierEdit = () => {
  const [saveFailed, setSaveFailed] = useState(false);
  return (
    <EditBase
      resource="romiku_product_suppliers"
      redirect="/product-library"
      transform={toProductSupplierWrite}
      mutationMode="pessimistic"
      mutationOptions={{
        onMutate: () => setSaveFailed(false),
        onError: () => setSaveFailed(true),
      }}
    >
      <ProductFormCard title="编辑产品供应商采购信息">
        {saveFailed && (
          <p role="alert" className="text-destructive">
            保存失败，修改内容已保留。请检查权限或网络后重试。
          </p>
        )}
        <ProductSupplierInputs edit />
      </ProductFormCard>
    </EditBase>
  );
};

export const ProcurementCostCreate = () => {
  const [saveFailed, setSaveFailed] = useState(false);
  return (
    <CreateBase
      resource="romiku_procurement_cost_history"
      redirect="/product-library"
      transform={toProcurementCostWrite}
      mutationOptions={{
        onMutate: () => setSaveFailed(false),
        onError: () => setSaveFailed(true),
      }}
    >
      <ProductFormCard title="新建参考成本">
        {saveFailed && (
          <p role="alert" className="text-destructive">
            保存失败，输入内容已保留。请检查权限或网络后重试。
          </p>
        )}
        <ProcurementCostInputs />
      </ProductFormCard>
    </CreateBase>
  );
};

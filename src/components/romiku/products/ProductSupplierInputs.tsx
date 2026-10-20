import { required } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

export const ProductSupplierInputs = ({ edit = false }: { edit?: boolean }) => (
  <div className="grid max-w-4xl gap-4 md:grid-cols-2">
    <TextInput
      source="sku"
      label="SKU"
      validate={required()}
      helperText={false}
      disabled={edit}
    />
    <ReferenceInput source="supplier_id" reference="romiku_suppliers">
      <SelectInput
        optionText="name"
        label="供应商"
        validate={required()}
        helperText={false}
        disabled={edit}
      />
    </ReferenceInput>
    <TextInput
      source="supplier_item_number"
      label="供应商货号"
      helperText={false}
    />
    <NumberInput source="moq" label="最小起订量" min={0} helperText={false} />
    <NumberInput
      source="lead_days"
      label="交期（天）"
      min={0}
      step={1}
      helperText={false}
    />
    <NumberInput
      source="qty_per_carton"
      label="供应商覆盖值（可选）：每箱数量"
      min={0.0001}
      helperText={false}
    />
    <DateInput source="reference_date" label="参考日期" helperText={false} />
    <NumberInput
      source="length_cm"
      label="供应商覆盖值（可选）：长度（cm）"
      min={0}
      helperText={false}
    />
    <NumberInput
      source="width_cm"
      label="供应商覆盖值（可选）：宽度（cm）"
      min={0}
      helperText={false}
    />
    <NumberInput
      source="height_cm"
      label="供应商覆盖值（可选）：高度（cm）"
      min={0}
      helperText={false}
    />
    <NumberInput
      source="carton_weight_kg"
      label="供应商覆盖值（可选）：每箱重量（kg）"
      min={0}
      helperText={false}
    />
    <div className="flex gap-6">
      <BooleanInput source="preferred" label="首选" helperText={false} />
      <BooleanInput
        source="active"
        label="启用"
        helperText={false}
        defaultValue
        disabled={edit}
      />
    </div>
    <TextInput source="notes" label="备注" multiline helperText={false} />
  </div>
);

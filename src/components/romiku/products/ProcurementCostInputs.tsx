import { required } from "ra-core";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

export const ProcurementCostInputs = () => (
  <div className="grid max-w-4xl gap-4 md:grid-cols-2">
    <ReferenceInput
      source="product_supplier_id"
      reference="romiku_product_suppliers"
    >
      <SelectInput
        optionText="sku"
        label="产品供应商"
        validate={required()}
        helperText={false}
      />
    </ReferenceInput>
    <NumberInput
      source="cost"
      label="成本"
      min={0}
      validate={required()}
      helperText={false}
    />
    <TextInput
      source="currency"
      label="币种（ISO 4217）"
      validate={required()}
      helperText={false}
    />
    <DateInput
      source="effective_date"
      label="生效日期"
      validate={required()}
      helperText={false}
    />
    <TextInput
      source="source_type"
      label="来源类型"
      validate={required()}
      helperText={false}
    />
    <TextInput
      source="source_note"
      label="来源备注"
      multiline
      helperText={false}
    />
  </div>
);

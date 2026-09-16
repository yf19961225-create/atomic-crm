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
      <SelectInput optionText="sku" validate={required()} helperText={false} />
    </ReferenceInput>
    <NumberInput
      source="cost"
      min={0}
      validate={required()}
      helperText={false}
    />
    <TextInput
      source="currency"
      label="Currency (ISO 4217)"
      validate={required()}
      helperText={false}
    />
    <DateInput
      source="effective_date"
      validate={required()}
      helperText={false}
    />
    <TextInput source="source_type" validate={required()} helperText={false} />
    <TextInput source="source_note" multiline helperText={false} />
  </div>
);

import { required } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

export const ProductSupplierInputs = () => (
  <div className="grid max-w-4xl gap-4 md:grid-cols-2">
    <TextInput source="sku" validate={required()} helperText={false} />
    <ReferenceInput source="supplier_id" reference="romiku_suppliers">
      <SelectInput optionText="name" validate={required()} helperText={false} />
    </ReferenceInput>
    <TextInput source="supplier_item_number" helperText={false} />
    <NumberInput source="moq" min={0} helperText={false} />
    <NumberInput source="lead_days" min={0} step={1} helperText={false} />
    <NumberInput source="qty_per_carton" min={0.0001} helperText={false} />
    <DateInput source="reference_date" helperText={false} />
    <NumberInput source="length_cm" min={0} helperText={false} />
    <NumberInput source="width_cm" min={0} helperText={false} />
    <NumberInput source="height_cm" min={0} helperText={false} />
    <NumberInput source="carton_weight_kg" min={0} helperText={false} />
    <div className="flex gap-6">
      <BooleanInput source="preferred" helperText={false} />
      <BooleanInput source="active" helperText={false} defaultValue />
    </div>
    <TextInput source="notes" multiline helperText={false} />
  </div>
);

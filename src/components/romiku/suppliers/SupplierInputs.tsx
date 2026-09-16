import { required } from "ra-core";
import { ArrayInput } from "@/components/admin/array-input";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";

export const SupplierInputs = () => (
  <div className="grid max-w-3xl gap-4 md:grid-cols-2">
    <TextInput source="name" validate={required()} helperText={false} />
    <SelectInput
      source="status"
      choices={["active", "paused", "inactive"]}
      helperText={false}
    />
    <SelectInput source="grade" choices={["A", "B", "C"]} helperText={false} />
    <NumberInput source="default_lead_days" min={0} helperText={false} />
    <TextInput source="region" helperText={false} />
    <ArrayInput source="categories" helperText={false}>
      <SimpleFormIterator disableReordering fullWidth getItemLabel={false}>
        <TextInput source="" label="Category" helperText={false} />
      </SimpleFormIterator>
    </ArrayInput>
    <TextInput source="address" multiline helperText={false} />
    <TextInput source="shipping_address" multiline helperText={false} />
    <TextInput source="notes" multiline helperText={false} />
  </div>
);

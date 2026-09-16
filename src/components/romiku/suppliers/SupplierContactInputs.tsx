import { required } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

export const SupplierContactInputs = () => (
  <div className="grid max-w-3xl gap-4 md:grid-cols-2">
    <ReferenceInput source="supplier_id" reference="romiku_suppliers">
      <SelectInput optionText="name" validate={required()} helperText={false} />
    </ReferenceInput>
    <TextInput source="name" validate={required()} helperText={false} />
    <TextInput source="title" helperText={false} />
    <TextInput source="department" helperText={false} />
    <TextInput source="role" helperText={false} />
    <TextInput source="email" type="email" helperText={false} />
    <TextInput source="phone" helperText={false} />
    <TextInput source="whatsapp" helperText={false} />
    <TextInput source="wechat" helperText={false} />
    <div className="flex gap-6">
      <BooleanInput source="is_primary" helperText={false} />
      <BooleanInput source="is_active" helperText={false} defaultValue />
    </div>
    <TextInput source="notes" multiline helperText={false} />
  </div>
);

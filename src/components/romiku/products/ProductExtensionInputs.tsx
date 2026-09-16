import { required } from "ra-core";
import { TextInput } from "@/components/admin/text-input";

export const ProductExtensionInputs = () => (
  <div className="flex max-w-3xl flex-col gap-4">
    <TextInput source="sku" validate={required()} helperText={false} />
    <TextInput
      source="sanity_product_id"
      label="Sanity product ID"
      helperText="Optional; set only from an explicitly configured read match."
    />
    <TextInput source="internal_notes" multiline helperText={false} />
  </div>
);

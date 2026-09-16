import { required, useInput } from "ra-core";
import { useWatch } from "react-hook-form";
import { TextInput } from "@/components/admin/text-input";
import { SanityProductLookup } from "./SanityProductLookup";
import { useSanityProductSource } from "./sanityProductSource";

export const ProductExtensionInputs = () => {
  const sku = (useWatch({ name: "sku" }) as string | undefined) ?? "";
  const source = useSanityProductSource();
  const sanityId = useInput({ source: "sanity_product_id" });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <TextInput source="sku" validate={required()} helperText={false} />
      <SanityProductLookup
        sku={sku}
        source={source}
        onMatched={sanityId.field.onChange}
      />
      <TextInput
        source="sanity_product_id"
        label="Sanity product ID"
        helperText="Optional; set only from an explicitly configured read match."
      />
      <TextInput source="internal_notes" multiline helperText={false} />
    </div>
  );
};

import { required, useInput } from "ra-core";
import { useWatch } from "react-hook-form";
import { TextInput } from "@/components/admin/text-input";
import { SanityProductLookup } from "./SanityProductLookup";
import { useSanityProductSource } from "./sanityProductSource";

export const ProductExtensionInputs = () => {
  const sku = (useWatch({ name: "sku" }) as string | undefined) ?? "";
  const source = useSanityProductSource();
  const sanityId = useInput({ source: "sanity_product_id" });
  const verified = useInput({ source: "_sanity_verified" });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <TextInput source="sku" validate={required()} helperText={false} />
      <SanityProductLookup
        sku={sku}
        source={source}
        onMatched={(id) => {
          sanityId.field.onChange(id);
          verified.field.onChange(true);
        }}
      />
      <TextInput source="internal_notes" multiline helperText={false} />
    </div>
  );
};

import { required, useInput } from "ra-core";
import { useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import { TextInput } from "@/components/admin/text-input";
import { SanityProductLookup } from "./SanityProductLookup";
import { useSanityProductSource } from "./sanityProductSource";

export const ProductExtensionInputs = () => {
  const sku = (useWatch({ name: "sku" }) as string | undefined) ?? "";
  const source = useSanityProductSource();
  const sanityId = useInput({ source: "sanity_product_id" });
  const verified = useInput({ source: "_sanity_verified" });
  const verifiedSku = useInput({ source: "_sanity_verified_sku" });
  const initialSku = useRef(sku);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (sanityId.field.value && !verified.field.value) {
        verified.field.onChange(true);
        verifiedSku.field.onChange(sku);
      }
      initialSku.current = sku;
      return;
    }
    if (sku === initialSku.current) return;
    initialSku.current = sku;
    sanityId.field.onChange(null);
    verified.field.onChange(false);
    verifiedSku.field.onChange(null);
  }, [sku]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <TextInput
        source="sku"
        label="SKU"
        validate={required()}
        helperText={false}
      />
      <SanityProductLookup
        sku={sku}
        source={source}
        onMatched={(id) => {
          sanityId.field.onChange(id);
          verified.field.onChange(true);
          verifiedSku.field.onChange(sku);
        }}
        onCleared={() => {
          sanityId.field.onChange(null);
          verified.field.onChange(false);
          verifiedSku.field.onChange(null);
        }}
      />
      <TextInput
        source="internal_notes"
        label="内部备注"
        multiline
        helperText={false}
      />
    </div>
  );
};

-- Only new Inquiry-to-Quote specifications are normalized. Historical snapshots remain untouched.
CREATE OR REPLACE FUNCTION "public"."romiku_quote_from_inquiry"("inquiry_id" "uuid", "selected_item_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  source public.romiku_website_inquiries;
  new_id uuid;
  selected_count integer;
BEGIN
  SELECT * INTO STRICT source FROM public.romiku_website_inquiries WHERE id = inquiry_id FOR UPDATE;
  SELECT count(*) INTO selected_count FROM public.romiku_website_inquiry_items i
    WHERE i.inquiry_id = source.id AND i.id = ANY(selected_item_ids);
  IF selected_count = 0 OR selected_count <> cardinality(selected_item_ids) THEN
    RAISE EXCEPTION 'Select distinct items belonging to the inquiry' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.romiku_quotes(source_website_inquiry_id,outbound_company_id,formal_customer_id,counterparty_snapshot)
  VALUES (source.id,source.outbound_company_id,source.formal_customer_id,
    jsonb_build_object('name',source.customer_name,'contact_name',source.customer_name,'company',source.company,'brand',source.brand,'email',source.email,'whatsapp',source.whatsapp,'country',source.country))
  RETURNING id INTO new_id;
  INSERT INTO public.romiku_quote_items(quote_id,source_website_inquiry_item_id,sanity_product_id,sku,quantity,requested_quantity_snapshot,requirement,product_snapshot,packing_snapshot,position)
  SELECT new_id,i.id,i.sanity_product_id,i.sku,i.quantity,i.quantity,i.requirement,
    CASE WHEN jsonb_typeof(i.product_snapshot->'specification') = 'string' THEN
      jsonb_set(i.product_snapshot, '{specification}', to_jsonb(
        regexp_replace(regexp_replace(i.product_snapshot->>'specification',
          '^[[:space:]]*(specifications?|specs)[[:space:]]*:[[:space:]]*', '', 'i'),
          '^[[:space:]]+|[[:space:]]+$', '', 'g')
      ))
    ELSE i.product_snapshot END,
    jsonb_strip_nulls(jsonb_build_object('qty_per_carton',i.product_snapshot->'cartonQty','carton_cbm',i.product_snapshot->'carton_cbm')),array_position(selected_item_ids,i.id)
    FROM public.romiku_website_inquiry_items i WHERE i.id = ANY(selected_item_ids);
  RETURN new_id;
END;
$$;

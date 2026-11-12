-- Test-only, SECURITY INVOKER adapters. They exercise the real RPC and existing
-- validation under the test's current authenticated actor, never bypass guards.
CREATE OR REPLACE FUNCTION pg_temp.document_patch(k text,d uuid,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE s jsonb;
BEGIN
 s:=public.romiku_document_snapshot(k,d);
 RETURN public.romiku_save_document(k,d,(s->>'revision')::bigint,gen_random_uuid(),p,NULL);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.document_item_patch(k text,d uuid,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE parent uuid; s jsonb; rows jsonb; it text; fk text;
BEGIN
 it:='romiku_'||k||'_items';fk:=CASE k WHEN 'packing' THEN 'packing_list_id' ELSE k||'_id' END;
 EXECUTE format('SELECT %I FROM public.%I WHERE id=$1',fk,it) INTO STRICT parent USING d;
 s:=public.romiku_document_snapshot(k,parent);
 SELECT jsonb_agg((SELECT jsonb_object_agg(key,value) FROM jsonb_each(x) WHERE key=ANY(CASE WHEN k='packing' THEN ARRAY['id','order_id','source_order_item_id','sanity_product_id','sku','product_snapshot','quantity','cartons','qty_per_carton','length_cm','width_cm','height_cm','carton_weight_kg','remark','position'] ELSE ARRAY['id','sku','sanity_product_id','quantity','unit_price','unit_price_entered','source_cny_unit_price','product_snapshot','packing_snapshot','requirement','customer_code','notes','position'] END)) || CASE WHEN x->>'id'=d::text THEN CASE WHEN k='packing' AND p ? 'quantity' THEN p||'{"cartons":0,"qty_per_carton":0}'::jsonb ELSE p END ELSE '{}'::jsonb END)
 INTO rows FROM jsonb_array_elements(s->'items') x;
 RETURN public.romiku_save_document(k,parent,(s->>'revision')::bigint,gen_random_uuid(),'{}',rows);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.document_convert(k text,d uuid,target text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER AS $$
 SELECT (public.romiku_create_document_from_source(gen_random_uuid(),k,d,target,NULL,(public.romiku_document_snapshot(k,d)->>'revision')::bigint)->>'document_id')::uuid;
$$;
CREATE OR REPLACE FUNCTION pg_temp.document_from_inquiry(d uuid,selected uuid[]) RETURNS uuid
LANGUAGE sql SECURITY INVOKER AS $$
 SELECT (public.romiku_create_document_from_source(gen_random_uuid(),'website_inquiry',d,'quote',selected,NULL)->>'document_id')::uuid;
$$;

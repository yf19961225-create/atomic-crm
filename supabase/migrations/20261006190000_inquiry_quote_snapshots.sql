-- Controlled Preview intake: immutable first submission and independent Quote request quantities.
alter table public.romiku_website_inquiries add column submission_id uuid unique, add column source text not null default 'website' check(source='website'), add column brand text;
alter table public.romiku_quote_items add column requested_quantity_snapshot numeric(18,4) check(requested_quantity_snapshot>0);
alter table public.romiku_website_inquiry_items add column position integer not null default 0 check(position>=0);
drop function public.romiku_submit_website_inquiry(jsonb);
CREATE OR REPLACE FUNCTION "public"."romiku_preserve_inquiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only the controlled RPC owner can use the transaction-local, record-scoped
    -- deletion permit. Authenticated callers cannot bypass this guard by setting it.
    IF current_user = pg_catalog.pg_get_userbyid(
         (SELECT proowner FROM pg_catalog.pg_proc
          WHERE oid = 'public.romiku_delete_record(text,uuid)'::regprocedure))
       AND current_setting('role', true) = 'authenticated'
       AND auth.uid() IS NOT NULL
       AND current_setting('romiku.controlled_inquiry_delete', true) =
         (to_jsonb(OLD)->>(CASE WHEN TG_TABLE_NAME = 'romiku_website_inquiries'
                              THEN 'id' ELSE 'inquiry_id' END)) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Archive inquiry originals instead of deleting' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'romiku_website_inquiries' THEN
    IF (NEW.customer_name,NEW.company,NEW.email,NEW.whatsapp,NEW.country,NEW.message,NEW.raw_payload,NEW.submitted_at,NEW.submission_id,NEW.source,NEW.brand)
       IS DISTINCT FROM
       (OLD.customer_name,OLD.company,OLD.email,OLD.whatsapp,OLD.country,OLD.message,OLD.raw_payload,OLD.submitted_at,OLD.submission_id,OLD.source,OLD.brand) THEN
      RAISE EXCEPTION 'Website submission is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.product_snapshot IS DISTINCT FROM OLD.product_snapshot
       AND EXISTS(SELECT 1 FROM public.romiku_website_inquiries h WHERE h.id=OLD.inquiry_id AND h.submission_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Original inquiry product snapshot is immutable' USING ERRCODE = '23514';
    END IF;
    IF (NEW.inquiry_id,NEW.sku,NEW.quantity,NEW.requirement,NEW.position)
       IS DISTINCT FROM (OLD.inquiry_id,OLD.sku,OLD.quantity,OLD.requirement,OLD.position) THEN
      RAISE EXCEPTION 'Original inquiry item is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  SELECT new_id,i.id,i.sanity_product_id,i.sku,i.quantity,i.quantity,i.requirement,i.product_snapshot,jsonb_strip_nulls(jsonb_build_object('qty_per_carton',i.product_snapshot->'cartonQty','carton_cbm',i.product_snapshot->'carton_cbm')),array_position(selected_item_ids,i.id)
    FROM public.romiku_website_inquiry_items i WHERE i.id = ANY(selected_item_ids);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_submit_website_inquiry"("payload" "jsonb") RETURNS TABLE("id" "uuid", "document_number" "text", "replay" boolean, "submitted_at" timestamptz, "normalizedSubmission" jsonb)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  field_name text;
  item jsonb;
  item_quantity numeric;
  inquiry_id uuid;
  inquiry_number text;
  submission_uuid uuid;
  existing public.romiku_website_inquiries;
BEGIN
  -- SECURITY INVOKER: only service_role receives EXECUTE. Validate here too,
  -- so direct server RPC callers cannot bypass the HTTP boundary's checks.
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid inquiry payload' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'submissionId' THEN
    IF jsonb_typeof(payload->'submissionId') IS DISTINCT FROM 'string'
      OR (payload->>'submissionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid submission ID' USING ERRCODE = '22023';
    END IF;
    submission_uuid := (payload->>'submissionId')::uuid;
    -- Serialize identical submissions before checking, including concurrent requests.
    -- The unique constraint is the final integrity guard; READ COMMITTED sees commits
    -- after waiting. A failed transaction releases this transaction-scoped lock.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Intake requires READ COMMITTED; retry transaction' USING ERRCODE = '40001';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(submission_uuid::text, 6100619));
    SELECT h.* INTO existing FROM public.romiku_website_inquiries h WHERE h.submission_id=submission_uuid;
    IF FOUND THEN
      RETURN QUERY SELECT existing.id,existing.document_number,true,existing.submitted_at,existing.raw_payload;
      RETURN;
    END IF;
  END IF;
  IF payload ? 'brand' AND (jsonb_typeof(payload->'brand') IS DISTINCT FROM 'string' OR length(payload->>'brand')>200) THEN
    RAISE EXCEPTION 'Invalid brand' USING ERRCODE = '22023';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['customerName','email','country','message'] LOOP
    IF jsonb_typeof(payload->field_name) IS DISTINCT FROM 'string'
       OR length(payload->>field_name) > (CASE field_name WHEN 'message' THEN 10000 WHEN 'email' THEN 320 WHEN 'customerName' THEN 200 ELSE 100 END)
       OR (field_name <> 'message' AND (payload->>field_name) !~ '[^[:space:]]') THEN
      RAISE EXCEPTION 'Invalid inquiry field: %', field_name USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (payload->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'whatsapp' AND payload->'whatsapp' <> 'null'::jsonb
     AND (jsonb_typeof(payload->'whatsapp') IS DISTINCT FROM 'string' OR length(payload->>'whatsapp') > 100) THEN
    RAISE EXCEPTION 'Invalid WhatsApp' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'company' AND (jsonb_typeof(payload->'company') IS DISTINCT FROM 'string' OR length(payload->>'company') > 200) THEN
    RAISE EXCEPTION 'Invalid company' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid inquiry items' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(payload->'items') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Expected 1 to 100 inquiry items' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
    IF jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item->'sku') IS DISTINCT FROM 'string'
       OR (item->>'sku') !~ '[^[:space:]]' OR length(item->>'sku') > 200
       OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item->'requirement') IS DISTINCT FROM 'string'
       OR length(item->>'requirement') > 10000 THEN
      RAISE EXCEPTION 'Invalid inquiry item' USING ERRCODE = '22023';
    END IF;
    IF submission_uuid IS NOT NULL THEN
      IF jsonb_typeof(item->'productName') IS DISTINCT FROM 'string' OR (item->>'productName') !~ '[^[:space:]]' OR length(item->>'productName')>500
         OR jsonb_typeof(item->'image') IS DISTINCT FROM 'string' OR length(item->>'image')>2048
         OR (item->>'image'<>'' AND (item->>'image') !~ '^https://romiku\.com/images/products-local/[^?#]+$')
         OR jsonb_typeof(item->'specification') IS DISTINCT FROM 'string' OR length(item->>'specification')>10000 THEN
        RAISE EXCEPTION 'Invalid normalized product snapshot' USING ERRCODE = '22023';
      END IF;
      IF item ? 'unit' AND (jsonb_typeof(item->'unit') IS DISTINCT FROM 'string' OR length(item->>'unit')>100) THEN
        RAISE EXCEPTION 'Invalid item unit' USING ERRCODE = '22023';
      END IF;
      FOREACH field_name IN ARRAY ARRAY['cartonQty','cartonCbm'] LOOP
        IF item ? field_name AND item->field_name <> 'null'::jsonb THEN
          IF jsonb_typeof(item->field_name) IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Invalid packing snapshot' USING ERRCODE = '22023';
          END IF;
          IF (item->>field_name)::numeric<0 OR (item->>field_name)::numeric>(CASE field_name WHEN 'cartonQty' THEN 100000000 ELSE 1000000 END) THEN
            RAISE EXCEPTION 'Invalid packing snapshot' USING ERRCODE = '22023';
          END IF;
        END IF;
      END LOOP;
    END IF;
    item_quantity := (item->>'quantity')::numeric;
    IF item_quantity <= 0 OR item_quantity >= 100000000000000 OR round(item_quantity,4) <> item_quantity THEN
      RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.romiku_website_inquiries(submission_id,source,brand,customer_name,company,email,whatsapp,country,message,raw_payload,owner_id)
  VALUES(submission_uuid,'website',payload->>'brand',payload->>'customerName',payload->>'company',payload->>'email',nullif(btrim(payload->>'whatsapp', E' \t\n\r'),''),payload->>'country',payload->>'message',payload,NULL)
  RETURNING romiku_website_inquiries.id,romiku_website_inquiries.document_number INTO inquiry_id,inquiry_number;
  INSERT INTO public.romiku_website_inquiry_items(inquiry_id,sku,quantity,requirement,product_snapshot,owner_id,position)
  SELECT inquiry_id,value->>'sku',(value->>'quantity')::numeric,value->>'requirement',
    CASE WHEN submission_uuid IS NULL THEN '{}'::jsonb ELSE jsonb_strip_nulls(jsonb_build_object(
      'name',value->>'productName','image_url',value->>'image','specification',value->>'specification',
      'unit',value->>'unit','cartonQty',value->'cartonQty','carton_cbm',value->'cartonCbm')) END,NULL,ordinality
  FROM jsonb_array_elements(payload->'items') WITH ORDINALITY;
  RETURN QUERY SELECT h.id,h.document_number,false,h.submitted_at,h.raw_payload FROM public.romiku_website_inquiries h WHERE h.id=inquiry_id;
END;
$$;

revoke all on function public.romiku_submit_website_inquiry(jsonb) from public,anon,authenticated;
grant execute on function public.romiku_submit_website_inquiry(jsonb) to service_role;
-- Quote source requested quantity is immutable, including legacy NULLs.
CREATE OR REPLACE FUNCTION "public"."romiku_quote_requested_quantity_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE original numeric; parent_source uuid; item_source uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.requested_quantity_snapshot IS NOT NULL AND
       (NEW.quote_id,NEW.source_website_inquiry_item_id) IS DISTINCT FROM (OLD.quote_id,OLD.source_website_inquiry_item_id) THEN
      RAISE EXCEPTION 'Requested quantity provenance is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.requested_quantity_snapshot IS DISTINCT FROM OLD.requested_quantity_snapshot THEN
      RAISE EXCEPTION 'Requested quantity snapshot is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT source_website_inquiry_id INTO parent_source FROM public.romiku_quotes WHERE id=NEW.quote_id;
  IF NEW.source_website_inquiry_item_id IS NOT NULL THEN
    SELECT quantity,inquiry_id INTO original,item_source FROM public.romiku_website_inquiry_items WHERE id=NEW.source_website_inquiry_item_id;
    IF parent_source IS NULL OR parent_source IS DISTINCT FROM item_source THEN
      RAISE EXCEPTION 'Inquiry item must belong to Quote source' USING ERRCODE='23514';
    END IF;
    NEW.requested_quantity_snapshot:=original;
  ELSIF NEW.requested_quantity_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'Requested quantity requires an Inquiry item source' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.romiku_quote_requested_quantity_guard() from public,anon,authenticated;
create trigger romiku_requested_quantity before insert or update on public.romiku_quote_items for each row execute function public.romiku_quote_requested_quantity_guard();

alter table public.romiku_website_inquiries drop column business_search_fields, drop column business_search_text;
alter table public.romiku_website_inquiries
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'customer_name',customer_name,'brand',brand,'company',company,'email',email,'whatsapp',whatsapp,'country',country,'message',message,'status',status,'processing_notes',processing_notes])||jsonb_object(array['submitted_at',public.romiku_search_date(submitted_at)]))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'customer_name',customer_name,'brand',brand,'company',company,'email',email,'whatsapp',whatsapp,'country',country,'message',message,'status',status,'processing_notes',processing_notes])||jsonb_object(array['submitted_at',public.romiku_search_date(submitted_at)]))) stored;
create index romiku_website_inquiries_business_search_idx on public.romiku_website_inquiries using gin (business_search_text extensions.gin_trgm_ops);

-- The header source selects the fixed Quote template and is creation-time provenance.
-- Inquiry conversion sets it on INSERT; ordinary edits and customer association do not.
CREATE OR REPLACE FUNCTION "public"."romiku_quote_inquiry_source_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.source_website_inquiry_id IS DISTINCT FROM OLD.source_website_inquiry_id THEN
    RAISE EXCEPTION 'Quote website inquiry provenance is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.romiku_quote_inquiry_source_guard() from public,anon,authenticated;
create trigger romiku_inquiry_source before update of source_website_inquiry_id on public.romiku_quotes for each row execute function public.romiku_quote_inquiry_source_guard();

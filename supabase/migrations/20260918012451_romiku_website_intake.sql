set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.romiku_submit_website_inquiry(payload jsonb)
 RETURNS TABLE(id uuid, document_number text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  field_name text;
  item jsonb;
  item_quantity numeric;
  inquiry_id uuid;
  inquiry_number text;
BEGIN
  -- SECURITY INVOKER: only service_role receives EXECUTE. Validate here too,
  -- so direct server RPC callers cannot bypass the HTTP boundary's checks.
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid inquiry payload' USING ERRCODE = '22023';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['customerName','email','whatsapp','country','message'] LOOP
    IF jsonb_typeof(payload->field_name) IS DISTINCT FROM 'string'
       OR length(payload->>field_name) > (CASE field_name WHEN 'message' THEN 10000 WHEN 'email' THEN 320 WHEN 'customerName' THEN 200 ELSE 100 END)
       OR (field_name <> 'message' AND (payload->>field_name) !~ '[^[:space:]]') THEN
      RAISE EXCEPTION 'Invalid inquiry field: %', field_name USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (payload->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email' USING ERRCODE = '22023';
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
    item_quantity := (item->>'quantity')::numeric;
    IF item_quantity <= 0 OR item_quantity >= 100000000000000 OR round(item_quantity,4) <> item_quantity THEN
      RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.romiku_website_inquiries(customer_name,company,email,whatsapp,country,message,raw_payload,owner_id)
  VALUES(payload->>'customerName',payload->>'company',payload->>'email',payload->>'whatsapp',payload->>'country',payload->>'message',payload,NULL)
  RETURNING romiku_website_inquiries.id,romiku_website_inquiries.document_number INTO inquiry_id,inquiry_number;
  INSERT INTO public.romiku_website_inquiry_items(inquiry_id,sku,quantity,requirement,owner_id)
  SELECT inquiry_id,value->>'sku',(value->>'quantity')::numeric,value->>'requirement',NULL
  FROM jsonb_array_elements(payload->'items');
  RETURN QUERY SELECT inquiry_id,inquiry_number;
END;
$function$
;

-- migra omits revocations inherited from default grants; retain the exact
-- declaration from 06_grants.sql so this RPC is never public/authenticated.
revoke all on function public.romiku_submit_website_inquiry(jsonb) from public, anon, authenticated;
grant execute on function public.romiku_submit_website_inquiry(jsonb) to service_role;

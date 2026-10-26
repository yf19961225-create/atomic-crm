-- Independent names; no backfill, no historical number/snapshot mutation.
ALTER TABLE public.romiku_quotes ADD COLUMN document_name text;
ALTER TABLE public.romiku_pis ADD COLUMN document_name text;
ALTER TABLE public.romiku_orders ADD COLUMN document_name text;

CREATE OR REPLACE FUNCTION "public"."romiku_assign_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  prefix_value text;
  digits integer;
  sequence_value text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_ARGV[0] IN ('quote','pi','order') THEN
      IF NEW.document_number IS DISTINCT FROM OLD.document_number THEN
        RAISE EXCEPTION 'Formal document number cannot be changed' USING ERRCODE = '23514';
      END IF;
      -- Preserve legacy numbers verbatim, including on unrelated updates.
      RETURN NEW;
    END IF;
    NEW.document_number := btrim(coalesce(NEW.document_number,''));
    IF NEW.document_number = '' THEN
      RAISE EXCEPTION 'Document number is required' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.document_number IS NOT NULL THEN
    RAISE EXCEPTION 'Document number is server generated' USING ERRCODE = '23514';
  END IF;
  IF TG_ARGV[0] = 'quote' THEN
    NEW.document_number := public.romiku_next_daily_document_number('quote','RFQ');
  ELSIF TG_ARGV[0] = 'pi' THEN
    NEW.document_number := public.romiku_next_daily_document_number('pi','PI');
  ELSIF TG_ARGV[0] = 'order' THEN
    NEW.document_number := public.romiku_next_daily_document_number('order','OD');
  ELSE
    SELECT r.prefix, r.min_digits INTO prefix_value, digits
      FROM public.romiku_numbering_rules r WHERE r.document_kind = TG_ARGV[0];
    prefix_value := coalesce(prefix_value, TG_ARGV[1]);
    digits := coalesce(digits, 6);
    sequence_value := nextval('public.romiku_document_number_seq')::text;
    NEW.document_number := prefix_value || '-' || lpad(sequence_value, greatest(digits, length(sequence_value)), '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_convert_document"("source_kind" "text", "source_id" "uuid", "target_kind" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
DECLARE
  source_table text;
  target_table text;
  source_items text;
  target_items text;
  source_fk text;
  target_fk text;
  lineage_column text;
  source_json jsonb;
  new_id uuid;
BEGIN
  IF source_kind = 'quote' AND target_kind IN ('pi','order') THEN
    source_table := 'romiku_quotes'; source_items := 'romiku_quote_items'; source_fk := 'quote_id';
    lineage_column := 'source_quote_item_id';
  ELSIF source_kind = 'pi' AND target_kind = 'order' THEN
    source_table := 'romiku_pis'; source_items := 'romiku_pi_items'; source_fk := 'pi_id';
    lineage_column := 'source_pi_item_id';
  ELSE
    RAISE EXCEPTION 'Unsupported document conversion' USING ERRCODE = '23514';
  END IF;
  IF target_kind = 'pi' THEN
    target_table := 'romiku_pis'; target_items := 'romiku_pi_items'; target_fk := 'pi_id';
  ELSE
    target_table := 'romiku_orders'; target_items := 'romiku_order_items'; target_fk := 'order_id';
  END IF;
  EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE id = $1 FOR UPDATE',source_table)
    INTO source_json USING source_id;
  IF source_json IS NULL THEN
    RAISE EXCEPTION 'Source document not found' USING ERRCODE = 'P0002';
  END IF;
  -- Item writes also lock this header, preserving a coherent copy while converting.
  source_json := source_json || jsonb_build_object('source_' || source_kind || '_id',source_id);
  EXECUTE format('INSERT INTO public.%I (document_name,counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_language,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s)
    SELECT document_name,counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_language,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s FROM jsonb_populate_record(NULL::public.%I,$1) RETURNING id',
    target_table,CASE WHEN target_kind = 'order' THEN ',source_pi_id' ELSE '' END,
    CASE WHEN target_kind = 'order' THEN ',source_pi_id' ELSE '' END,target_table)
    INTO new_id USING source_json;
  EXECUTE format('INSERT INTO public.%I (%I,%I,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,unit_price_entered,requirement,customer_code,notes,position)
    SELECT $1,id,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,unit_price_entered,requirement,customer_code,notes,position FROM public.%I WHERE %I=$2',
    target_items,target_fk,lineage_column,source_items,source_fk) USING new_id,source_id;
  RETURN new_id;
END;
$_$;

CREATE OR REPLACE FUNCTION public.romiku_business_search_hits(query text, resource_types text[] DEFAULT NULL, filters jsonb DEFAULT '{}')
RETURNS TABLE(resource_type text,id uuid,title text,subtitle text,created_at timestamptz,rank integer,matched_fields text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $_$
#variable_conflict use_column
declare
  allowed constant text[] := array['formal_customer','outbound','website_inquiry','quote','pi','order','production','packing'];
  types text[]; q text; pattern text; search_phone text; status_filter text; order_filter uuid; customer_filter uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if query is null or length(query)>500
     or filters is null or jsonb_typeof(filters)<>'object' then
    raise exception 'Invalid search arguments' using errcode='22023';
  end if;
  types := coalesce(resource_types,allowed);
  if array_ndims(types)>1 or exists(select 1 from unnest(types) t where t is null or not(t=any(allowed))) then
    raise exception 'Unsupported resource type' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(filters) f where f.key not in ('status','order_id','formal_customer_id') or jsonb_typeof(f.value)<>'string') then
    raise exception 'Unsupported search filter' using errcode='22023';
  end if;
  status_filter := filters->>'status';
  if filters ? 'order_id' then
    begin order_filter := (filters->>'order_id')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid order_id filter' using errcode='22023'; end;
  end if;
  if filters ? 'formal_customer_id' then
    begin customer_filter := (filters->>'formal_customer_id')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid formal_customer_id filter' using errcode='22023'; end;
  end if;
  q := lower(regexp_replace(replace(query,chr(160),' '),'^[[:space:]]+|[[:space:]]+$','','g'));
  pattern := replace(replace(replace(q,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  search_phone := case when q ~ '^[+0-9().[:space:]-]+$' and q ~ '[0-9]' then regexp_replace(q,'[^0-9]','','g') end;
  return query with hits as (
select 'formal_customer'::text resource_type,h.id,h.name title,coalesce(h.country,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_formal_customers h
 cross join lateral public.romiku_search_matches(h.business_search_fields,q,pattern,search_phone) m
 where q<>'' and 'formal_customer'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'formal_customer'::text resource_type,h.id,h.name title,coalesce(h.country,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_formal_customers h join public.romiku_customer_contacts c on c.formal_customer_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('contacts.'||j.key,j.value) from jsonb_each(c.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'formal_customer'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (c.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and c.business_search_text like '%'||search_phone||'%'))
 union all
select 'formal_customer'::text resource_type,h.id,h.name title,coalesce(h.country,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_formal_customers h join public.romiku_outbound_companies src on src.id=h.source_outbound_company_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_outbound.name',lower(src.name),'source_outbound.brand_name',lower(src.brand_name),'source_outbound.city',lower(src.city)),q,pattern,null) m
 where q<>'' and 'formal_customer'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'outbound'::text resource_type,h.id,h.name title,coalesce(h.country,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_outbound_companies h
 cross join lateral public.romiku_search_matches(h.business_search_fields,q,pattern,search_phone) m
 where q<>'' and 'outbound'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'outbound'::text resource_type,h.id,h.name title,coalesce(h.country,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_outbound_companies h join public.romiku_outbound_contacts c on c.outbound_company_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('contacts.'||j.key,j.value) from jsonb_each(c.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'outbound'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (c.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and c.business_search_text like '%'||search_phone||'%'))
 union all
select 'outbound'::text resource_type,h.id,h.name title,coalesce(h.country,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_outbound_companies h join public.romiku_outbound_followups f on f.outbound_company_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('followups.'||j.key,j.value) from jsonb_each(f.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'outbound'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (f.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and f.business_search_text like '%'||search_phone||'%'))
 union all
select 'website_inquiry'::text resource_type,h.id,h.document_number title,coalesce(h.customer_name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_website_inquiries h
 cross join lateral public.romiku_search_matches(h.business_search_fields,q,pattern,search_phone) m
 where q<>'' and 'website_inquiry'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'website_inquiry'::text resource_type,h.id,h.document_number title,coalesce(h.customer_name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_website_inquiries h join public.romiku_website_inquiry_items i on i.inquiry_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'website_inquiry'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'quote'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_quotes h
 cross join lateral public.romiku_search_matches(h.business_search_fields,q,pattern,search_phone) m
 where q<>'' and 'quote'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'quote'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_quotes h join public.romiku_quote_items i on i.quote_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'quote'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'quote'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_quotes h join public.romiku_formal_customers src on src.id=h.formal_customer_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_customer.name',lower(src.name)),q,pattern,null) m
 where q<>'' and 'quote'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'quote'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_quotes h join public.romiku_outbound_companies src on src.id=h.outbound_company_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_outbound.name',lower(src.name),'source_outbound.brand_name',lower(src.brand_name),'source_outbound.city',lower(src.city)),q,pattern,null) m
 where q<>'' and 'quote'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'quote'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_quotes h join public.romiku_website_inquiries src on src.id=h.source_website_inquiry_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_inquiry.document_number',lower(src.document_number)),q,pattern,null) m
 where q<>'' and 'quote'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h
 cross join lateral public.romiku_search_matches(h.business_search_fields,q,pattern,search_phone) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h join public.romiku_pi_items i on i.pi_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h join public.romiku_formal_customers src on src.id=h.formal_customer_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_customer.name',lower(src.name)),q,pattern,null) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h join public.romiku_outbound_companies src on src.id=h.outbound_company_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_outbound.name',lower(src.name),'source_outbound.brand_name',lower(src.brand_name),'source_outbound.city',lower(src.city)),q,pattern,null) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h join public.romiku_website_inquiries src on src.id=h.source_website_inquiry_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_inquiry.document_number',lower(src.document_number)),q,pattern,null) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h join public.romiku_quotes src on src.id=h.source_quote_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_quote.document_number',lower(src.document_number)),q,pattern,null) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h
 cross join lateral public.romiku_search_matches(h.business_search_fields,q,pattern,search_phone) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h join public.romiku_order_items i on i.order_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h join public.romiku_formal_customers src on src.id=h.formal_customer_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_customer.name',lower(src.name)),q,pattern,null) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h join public.romiku_outbound_companies src on src.id=h.outbound_company_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_outbound.name',lower(src.name),'source_outbound.brand_name',lower(src.brand_name),'source_outbound.city',lower(src.city)),q,pattern,null) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h join public.romiku_website_inquiries src on src.id=h.source_website_inquiry_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_inquiry.document_number',lower(src.document_number)),q,pattern,null) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h join public.romiku_quotes src on src.id=h.source_quote_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_quote.document_number',lower(src.document_number)),q,pattern,null) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h join public.romiku_pis src on src.id=h.source_pi_id
 cross join lateral public.romiku_search_matches(jsonb_build_object('source_pi.document_number',lower(src.document_number)),q,pattern,null) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and src.business_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'production'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_production_orders h
 cross join lateral public.romiku_search_matches((h.business_search_fields - 'name' || jsonb_build_object('document_name',h.business_search_fields->'name')),q,pattern,search_phone) m
 where q<>'' and 'production'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.order_id=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'production'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_production_orders h join public.romiku_production_items i on i.production_order_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'production'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.order_id=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'production'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_production_orders h join public.romiku_orders src on src.id=h.order_id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('source_order.'||j.key,j.value) from jsonb_each(src.source_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'production'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.order_id=order_filter) and (src.source_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and src.source_search_text like '%'||search_phone||'%'))
 union all
select 'packing'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_packing_lists h
 cross join lateral public.romiku_search_matches((h.business_search_fields - 'name' || jsonb_build_object('document_name',h.business_search_fields->'name')),q,pattern,search_phone) m
 where q<>'' and 'packing'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.order_id=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'packing'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_packing_lists h join public.romiku_packing_items i on i.packing_list_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'packing'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.order_id=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'packing'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_packing_lists h join public.romiku_orders src on src.id=h.order_id cross join lateral public.romiku_search_matches(jsonb_build_object('source_order.document_number',lower(src.document_number)),q,pattern,null) m where q<>'' and 'packing'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.order_id=order_filter) and src.source_search_text like '%'||pattern||'%' escape E'\\'
 union all
select 'quote'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_quotes h
 cross join lateral public.romiku_search_matches(jsonb_build_object('document_name',lower(h.document_name)),q,pattern,null) m
 where q<>'' and 'quote'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and lower(h.document_name) like '%'||pattern||'%' escape E'\\'
 union all
select 'pi'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_pis h
 cross join lateral public.romiku_search_matches(jsonb_build_object('document_name',lower(h.document_name)),q,pattern,null) m
 where q<>'' and 'pi'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or null::uuid=order_filter) and lower(h.document_name) like '%'||pattern||'%' escape E'\\'
 union all
select 'order'::text resource_type,h.id,h.document_number title,coalesce(h.counterparty_snapshot->>'name',h.counterparty_snapshot->>'company','') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_orders h
 cross join lateral public.romiku_search_matches(jsonb_build_object('document_name',lower(h.document_name)),q,pattern,null) m
 where q<>'' and 'order'=any(types) and (status_filter is null or h.status=status_filter) and (order_filter is null or h.id=order_filter) and lower(h.document_name) like '%'||pattern||'%' escape E'\\'
  ), merged as (
    select resource_type,id,title,subtitle,created_at,min(rank) rank,array_agg(distinct f order by f) matched_fields
    from hits cross join lateral unnest(matched_fields) a(f)
    where customer_filter is null or exists(select 1 from public.romiku_customer_document_membership cm where cm.customer_id=customer_filter and cm.resource_type=hits.resource_type and cm.record_id=hits.id)
    group by resource_type,id,title,subtitle,created_at
  ) select * from merged;
end $_$;


-- Read-only parent pagination over all children visible through the caller's RLS.
CREATE OR REPLACE FUNCTION public.romiku_list_production_order_groups(
    p_search text DEFAULT '',
    p_view text DEFAULT 'ongoing',
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_order_id uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY INVOKER
    SET search_path TO ''
AS $function$
DECLARE
    result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_search IS NULL OR length(p_search) > 200 OR
       p_view IS NULL OR p_view NOT IN ('ongoing', 'received', 'cancelled', 'all') OR
       p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR
       p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'Invalid production group parameters' USING ERRCODE = '22023';
    END IF;

    WITH visible_children AS MATERIALIZED (
        SELECT p.*, s.name AS current_supplier_name,
            (btrim(p_search) <> '' AND position(lower(btrim(p_search)) IN lower(concat_ws(' ',
                p.document_number, s.name, p.supplier_snapshot->>'name'))) > 0) AS child_search_hit
        FROM public.romiku_production_orders p
        LEFT JOIN public.romiku_suppliers s ON s.id = p.supplier_id
        WHERE p_order_id IS NULL OR p.order_id = p_order_id
    ), groups AS (
        SELECT o.id, o.document_number, o.document_name, o.document_date,
            coalesce(nullif(o.counterparty_snapshot->>'company_name',''),
                nullif(o.counterparty_snapshot->>'company',''),
                nullif(o.counterparty_snapshot->>'name',''),
                nullif(o.counterparty_snapshot->>'business_name',''), '未填写客户') AS customer_name,
            count(*) AS production_count,
            count(*) FILTER (WHERE p.child_search_hit) AS matched_child_count,
            count(*) FILTER (WHERE p.status IN ('pending_send','scheduled')) AS ongoing_count,
            count(*) FILTER (WHERE p.status = 'received') AS received_count,
            count(*) FILTER (WHERE p.status = 'cancelled') AS cancelled_count,
            count(*) FILTER (WHERE p.status <> 'cancelled') AS effective_count,
            max(p.factory_due_at) AS latest_factory_due_at,
            max(p.created_at) AS latest_created_at,
            bool_or(p_search = '' OR position(lower(btrim(p_search)) IN lower(concat_ws(' ',
                o.document_number, o.document_name, o.counterparty_snapshot->>'company_name',
                o.counterparty_snapshot->>'company', o.counterparty_snapshot->>'name',
                o.counterparty_snapshot->>'business_name', p.document_number,
                p.current_supplier_name, p.supplier_snapshot->>'name'))) > 0) AS matches_search
        FROM public.romiku_orders o
        JOIN visible_children p ON p.order_id = o.id
        GROUP BY o.id
    ), eligible AS (
        SELECT * FROM groups WHERE matches_search AND (
            p_view = 'all' OR
            (p_view = 'ongoing' AND ongoing_count > 0) OR
            (p_view = 'received' AND ongoing_count = 0 AND received_count > 0) OR
            (p_view = 'cancelled' AND cancelled_count = production_count)
        )
    ), page_rows AS (
        SELECT e.*, coalesce((SELECT jsonb_agg((to_jsonb(hit) - 'exact_rank') ORDER BY hit.exact_rank, hit.document_number, hit.id)
            FROM (SELECT c.id, c.document_number,
                CASE WHEN lower(c.document_number) = lower(btrim(p_search)) THEN 0 ELSE 1 END AS exact_rank
                FROM visible_children c WHERE c.order_id = e.id AND c.child_search_hit
                ORDER BY exact_rank, c.document_number, c.id LIMIT 50) hit), '[]'::jsonb) AS matched_children
        FROM eligible e ORDER BY latest_created_at DESC, id ASC
        LIMIT p_page_size OFFSET ((p_page::bigint - 1) * p_page_size)
    )
    SELECT jsonb_build_object(
        'rows', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'matches_search'
            ORDER BY r.latest_created_at DESC, r.id ASC) FROM page_rows r), '[]'::jsonb),
        'total', (SELECT count(*) FROM eligible)
    ) INTO result;
    RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.romiku_list_production_order_groups(text,text,integer,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.romiku_list_production_order_groups(text,text,integer,integer,uuid) TO authenticated;
-- Append name without moving existing view columns or changing financial formulas.
-- pg_get_viewdef is read from these three fixed, existing views only.
DO $views$
DECLARE
  entry record;
  definition text;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('romiku_quote_totals','romiku_quotes'),
    ('romiku_pi_totals','romiku_pis'),
    ('romiku_order_totals','romiku_orders')
  ) AS v(view_name,table_name) LOOP
    definition := rtrim(pg_get_viewdef(format('public.%I',entry.view_name)::regclass,true), E';\n ');
    EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker=true) AS SELECT existing.*, header.document_name FROM (%s) existing JOIN public.%I header ON header.id=existing.id',entry.view_name,definition,entry.table_name);
  END LOOP;
END;
$views$;

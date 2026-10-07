-- Canonical pg_dump function declarations plus explicit generated search columns.
create extension if not exists pg_trgm with schema extensions;

CREATE OR REPLACE FUNCTION "public"."romiku_search_date"("value" "date") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
 select to_char(value,'YYYY-MM-DD')
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_search_date"("value" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
 select to_char(value at time zone 'UTC','YYYY-MM-DD')
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_search_fields"("value" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $_$
declare k text; v text; result jsonb := '{}'; digits text;
begin
  for k,v in select a.key,a.value from jsonb_each_text(value) a loop
    if v is not null and btrim(v) <> '' then
      result := result || jsonb_build_object(k,lower(btrim(v)));
      if k ~ '(^|\.)(phone|telephone|mobile|whatsapp|tel_whatsapp|receiving_phone)$' then
        digits := regexp_replace(v,'[^0-9]','','g');
        if digits <> '' then result := result || jsonb_build_object(k||'.digits',digits); end if;
      end if;
    end if;
  end loop;
  return result;
end $_$;

CREATE OR REPLACE FUNCTION "public"."romiku_search_join"("value" "text"[]) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ select array_to_string(value,' ') $$;

CREATE OR REPLACE FUNCTION "public"."romiku_search_matches"("fields" "jsonb", "q" "text", "pattern" "text", "phone" "text") RETURNS TABLE("rank" integer, "matched_fields" "text"[])
    LANGUAGE "plpgsql" IMMUTABLE ROWS 1 PARALLEL SAFE
    SET "search_path" TO ''
    AS $_$
declare k text; v text; needle text; pat text; score integer;
begin
  rank := 3; matched_fields := array[]::text[];
  for k,v in select a.key,a.value from jsonb_each_text(fields) a loop
    if k like '%.digits' then
      if phone is null then continue; end if;
      needle := phone; pat := phone;
    else needle := q; pat := pattern; end if;
    if v like '%'||pat||'%' escape E'\\' then
      score := case
        when v = needle and k ~ '(^|\.)(document_number|purchase_order_number|sku)$' then 0
        when v = needle and k not like 'items.%' and k ~ '(^|\.)(name|company|company_name|business_name|brand|brand_name|contact|contact_name|customer_name|email|consignee|consignee_contact|receiving_company|receiving_contact|digits)$|\.(saved_aliases|aliases)(\.[0-9]+)?$' then 1
        when v like pat||'%' escape E'\\' then 2 else 3 end;
      rank := least(rank,score);
      matched_fields := array_append(matched_fields,regexp_replace(k,'\.digits$',''));
    end if;
  end loop;
  if cardinality(matched_fields) > 0 then return next; end if;
end $_$;

CREATE OR REPLACE FUNCTION "public"."romiku_marking_search_fields"("value" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
 select jsonb_build_object(
   'marking.front_mark',value#>>'{front_mark,text}',
   'marking.side_mark',value#>>'{side_mark,text}',
   'marking.small_label',value#>>'{small_label,text}',
   'marking.labeling_requirements',value->>'labeling_requirements',
   'marking.production_requirements',value->>'production_requirements')
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_search_snapshot"("value" "jsonb", "prefix" "text", "kind" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
declare keys text[]; k text; locale text; v jsonb; result jsonb := '{}'; n integer;
begin
  keys := case kind
    when 'party' then array['name','company','company_name','business_name','brand','brand_name','contact','contact_name','customer_name','phone','telephone','mobile','whatsapp','tel_whatsapp','website','email','country','region','city','address','shipping_address','billing_address','consignee','consignee_contact','receiving_company','receiving_contact','receiving_phone','delivery_address','forwarder_address','tax_information','aliases','saved_aliases']
    when 'product' then array['sku','customer_code','name','name_zh','name_en','name_es','description','description_zh','description_en','description_es','specification','specifications','spec','requirement','requirements','notes','unit','shipping_mark','aliases']
    when 'requirements' then array['packaging','shipping_marks','product_labels','packing_preference','shipping_documents','certification','quality','other','notes','requirement','requirements','payment','delivery']
    when 'logistics' then array['receiving_company','receiving_contact','receiving_phone','delivery_address','forwarder_address','tax_information','preference']
    when 'intelligence' then array['operations','purchasing_scale','previous_suppliers','china_suppliers','recent_imports','entry_angle']
    else array[]::text[] end;
  foreach k in array keys loop
    v := value->k;
    if jsonb_typeof(v) in ('string','number') then
      result := result || jsonb_build_object(prefix||'.'||k, value->>k);
    elsif jsonb_typeof(v) = 'array' then
      n := 0;
      for v in select a.value from jsonb_array_elements(v) a loop
        n := n + 1;
        if jsonb_typeof(v) = 'string' then
          result := result || jsonb_build_object(prefix||'.'||k||'.'||n, v #>> '{}');
        end if;
      end loop;
    elsif jsonb_typeof(v) = 'object' and kind = 'product' then
      foreach locale in array array['zh','en','es'] loop
        if jsonb_typeof(v->locale) = 'string' then
          result := result || jsonb_build_object(prefix||'.'||k||'.'||locale,v->>locale);
        end if;
      end loop;
    end if;
  end loop;
  return result;
end $$;

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
  ), merged as (
    select resource_type,id,title,subtitle,created_at,min(rank) rank,array_agg(distinct f order by f) matched_fields
    from hits cross join lateral unnest(matched_fields) a(f)
    where customer_filter is null or exists(select 1 from public.romiku_customer_document_membership cm where cm.customer_id=customer_filter and cm.resource_type=hits.resource_type and cm.record_id=hits.id)
    group by resource_type,id,title,subtitle,created_at
  ) select * from merged;
end $_$;

CREATE OR REPLACE FUNCTION public.romiku_global_search(query text DEFAULT '',resource_types text[] DEFAULT NULL,"limit" integer DEFAULT 25,"offset" integer DEFAULT 0,filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
declare result jsonb; types text[]:=coalesce(resource_types,array['formal_customer','outbound','website_inquiry','quote','pi','order','production','packing']);
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if "limit" is null or "limit" not between 1 and 50 or "offset" is null or "offset"<0 then raise exception 'Invalid search arguments' using errcode='22023'; end if;
 if query is null or length(query)>500 or filters is null or jsonb_typeof(filters)<>'object' then raise exception 'Invalid search arguments' using errcode='22023'; end if;
 if array_ndims(types)>1 or exists(select 1 from unnest(types) t where t is null or t not in ('formal_customer','outbound','website_inquiry','quote','pi','order','production','packing')) then raise exception 'Unsupported resource type' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(filters) f where f.key not in ('status','order_id','formal_customer_id') or jsonb_typeof(f.value)<>'string') then raise exception 'Unsupported search filter' using errcode='22023'; end if;
 -- Evaluate the helper even for an empty resource list so validation is never skipped.
 if cardinality(types)=0 then perform 1 from public.romiku_business_search_hits(query,types,filters) limit 1; end if;
 with requested as (select t resource_type,min(n) position from unnest(types) with ordinality a(t,n) group by t),
 statuses as (select 'quote'::text resource_type,id,status from public.romiku_quotes union all select 'pi',id,status from public.romiku_pis union all select 'order',id,status from public.romiku_orders union all select 'production',id,status from public.romiku_production_orders union all select 'packing',id,status from public.romiku_packing_lists union all select 'website_inquiry',id,status from public.romiku_website_inquiries union all select 'outbound',id,status from public.romiku_outbound_companies union all select 'formal_customer',id,status from public.romiku_formal_customers),
 numbered as (select h.*,s.status,row_number() over(partition by h.resource_type order by rank,created_at desc,h.id) n,count(*) over(partition by h.resource_type) total_count from public.romiku_business_search_hits(query,types,filters) h join statuses s on s.resource_type=h.resource_type and s.id=h.id)
 select jsonb_build_object('groups',coalesce(jsonb_agg(jsonb_build_object(
 'resource_type',r.resource_type,'total_count',coalesce(p.total_count,0),'limit',"limit",'offset',"offset",'has_more',coalesce(p.total_count,0)>("offset"::bigint+"limit"),'items',coalesce(p.items,'[]'::jsonb)) order by r.position),'[]'::jsonb)) into result
 from requested r left join lateral (select max(n.total_count) total_count,jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'subtitle',n.subtitle,'matched_fields',n.matched_fields,'rank',n.rank,'status',n.status) order by n.n) filter(where n.n>"offset" and n.n<="offset"::bigint+"limit") items from numbered n where n.resource_type=r.resource_type) p on true;
 return result;
end $$;
revoke all on function public.romiku_business_search_hits(text,text[],jsonb) from public,anon;
grant execute on function public.romiku_business_search_hits(text,text[],jsonb) to authenticated,service_role;

CREATE OR REPLACE FUNCTION "public"."romiku_search_text"("value" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select coalesce(string_agg(v.value,E'\n' order by v.key),'') from jsonb_each_text(public.romiku_search_fields(value)) v
$$;

alter table public.romiku_formal_customers
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['name',name,'country',country,'status',status,'notes',notes])||public.romiku_search_snapshot(logistics,'logistics','logistics')||public.romiku_search_snapshot(requirements,'requirements','requirements')||public.romiku_marking_search_fields(marking_profile))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['name',name,'country',country,'status',status,'notes',notes])||public.romiku_search_snapshot(logistics,'logistics','logistics')||public.romiku_search_snapshot(requirements,'requirements','requirements')||public.romiku_marking_search_fields(marking_profile))) stored;
create index romiku_formal_customers_business_search_idx on public.romiku_formal_customers using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_outbound_companies
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['name',name,'brand_name',brand_name,'country',country,'city',city,'address',address,'registration_number',registration_number,'customer_type',customer_type,'website',website,'grade',grade,'status',status,'notes',notes])||jsonb_object(array['purchasing_categories',public.romiku_search_join(purchasing_categories)])||public.romiku_search_snapshot(business_intelligence,'business_intelligence','intelligence'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['name',name,'brand_name',brand_name,'country',country,'city',city,'address',address,'registration_number',registration_number,'customer_type',customer_type,'website',website,'grade',grade,'status',status,'notes',notes])||jsonb_object(array['purchasing_categories',public.romiku_search_join(purchasing_categories)])||public.romiku_search_snapshot(business_intelligence,'business_intelligence','intelligence'))) stored;
create index romiku_outbound_companies_business_search_idx on public.romiku_outbound_companies using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_website_inquiries
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'customer_name',customer_name,'brand',brand,'company',company,'email',email,'whatsapp',whatsapp,'country',country,'message',message,'status',status,'processing_notes',processing_notes])||jsonb_object(array['submitted_at',public.romiku_search_date(submitted_at)]))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'customer_name',customer_name,'brand',brand,'company',company,'email',email,'whatsapp',whatsapp,'country',country,'message',message,'status',status,'processing_notes',processing_notes])||jsonb_object(array['submitted_at',public.romiku_search_date(submitted_at)]))) stored;
create index romiku_website_inquiries_business_search_idx on public.romiku_website_inquiries using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_quotes
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'status',status,'currency',currency,'notes',notes,'price_term',price_term,'shipment_method',shipment_method])||jsonb_object(array['document_date',public.romiku_search_date(document_date)])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'status',status,'currency',currency,'notes',notes,'price_term',price_term,'shipment_method',shipment_method])||jsonb_object(array['document_date',public.romiku_search_date(document_date)])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored;
create index romiku_quotes_business_search_idx on public.romiku_quotes using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_pis
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'status',status,'currency',currency,'notes',notes,'price_term',price_term,'shipment_method',shipment_method])||jsonb_object(array['document_date',public.romiku_search_date(document_date)])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'status',status,'currency',currency,'notes',notes,'price_term',price_term,'shipment_method',shipment_method])||jsonb_object(array['document_date',public.romiku_search_date(document_date)])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored;
create index romiku_pis_business_search_idx on public.romiku_pis using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_orders
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'status',status,'currency',currency,'notes',notes,'price_term',price_term,'shipment_method',shipment_method,'purchase_order_number',purchase_order_number])||jsonb_object(array['document_date',public.romiku_search_date(document_date)])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'status',status,'currency',currency,'notes',notes,'price_term',price_term,'shipment_method',shipment_method,'purchase_order_number',purchase_order_number])||jsonb_object(array['document_date',public.romiku_search_date(document_date)])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored;
create index romiku_orders_business_search_idx on public.romiku_orders using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_production_orders
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'name',name,'status',status,'anomaly_notes',anomaly_notes,'notes',notes])||jsonb_object(array['factory_due_at',public.romiku_search_date(factory_due_at)])||public.romiku_search_snapshot(supplier_snapshot,'supplier_snapshot','party')||public.romiku_marking_search_fields(marking_snapshot))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'name',name,'status',status,'anomaly_notes',anomaly_notes,'notes',notes])||jsonb_object(array['factory_due_at',public.romiku_search_date(factory_due_at)])||public.romiku_search_snapshot(supplier_snapshot,'supplier_snapshot','party')||public.romiku_marking_search_fields(marking_snapshot))) stored;
create index romiku_production_orders_business_search_idx on public.romiku_production_orders using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_packing_lists
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'name',name,'shipping_mark',shipping_mark,'batch_label',batch_label,'notes',notes])||jsonb_object(array['packing_at',public.romiku_search_date(packing_at)])||public.romiku_search_snapshot(buyer_snapshot,'buyer_snapshot','party')||public.romiku_search_snapshot(seller_snapshot,'seller_snapshot','party'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'name',name,'shipping_mark',shipping_mark,'batch_label',batch_label,'notes',notes])||jsonb_object(array['packing_at',public.romiku_search_date(packing_at)])||public.romiku_search_snapshot(buyer_snapshot,'buyer_snapshot','party')||public.romiku_search_snapshot(seller_snapshot,'seller_snapshot','party'))) stored;
create index romiku_packing_lists_business_search_idx on public.romiku_packing_lists using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_customer_contacts
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['name',name,'title',title,'department',department,'role',role,'email',email,'phone',phone,'whatsapp',whatsapp,'wechat',wechat,'notes',notes]))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['name',name,'title',title,'department',department,'role',role,'email',email,'phone',phone,'whatsapp',whatsapp,'wechat',wechat,'notes',notes]))) stored;
create index romiku_customer_contacts_business_search_idx on public.romiku_customer_contacts using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_outbound_contacts
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['name',name,'title',title,'department',department,'role',role,'email',email,'phone',phone,'whatsapp',whatsapp,'wechat',wechat,'notes',notes]))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['name',name,'title',title,'department',department,'role',role,'email',email,'phone',phone,'whatsapp',whatsapp,'wechat',wechat,'notes',notes]))) stored;
create index romiku_outbound_contacts_business_search_idx on public.romiku_outbound_contacts using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_outbound_followups
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['method',method,'summary',summary,'notes',notes]))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['method',method,'summary',summary,'notes',notes]))) stored;
create index romiku_outbound_followups_business_search_idx on public.romiku_outbound_followups using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_quote_items
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['sku',sku,'requirement',requirement,'customer_code',customer_code,'notes',notes])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['sku',sku,'requirement',requirement,'customer_code',customer_code,'notes',notes])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored;
create index romiku_quote_items_business_search_idx on public.romiku_quote_items using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_pi_items
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['sku',sku,'requirement',requirement,'customer_code',customer_code,'notes',notes])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['sku',sku,'requirement',requirement,'customer_code',customer_code,'notes',notes])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored;
create index romiku_pi_items_business_search_idx on public.romiku_pi_items using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_order_items
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['sku',sku,'requirement',requirement,'customer_code',customer_code,'notes',notes])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['sku',sku,'requirement',requirement,'customer_code',customer_code,'notes',notes])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored;
create index romiku_order_items_business_search_idx on public.romiku_order_items using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_website_inquiry_items
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['sku',sku,'requirement',requirement])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['sku',sku,'requirement',requirement])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored;
create index romiku_website_inquiry_items_business_search_idx on public.romiku_website_inquiry_items using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_production_items
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['sku',sku,'production_note_zh',production_note_zh])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product')||public.romiku_search_snapshot(packaging_snapshot,'packaging_snapshot','product'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['sku',sku,'production_note_zh',production_note_zh])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product')||public.romiku_search_snapshot(packaging_snapshot,'packaging_snapshot','product'))) stored;
create index romiku_production_items_business_search_idx on public.romiku_production_items using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_packing_items
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['sku',sku,'remark',remark])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['sku',sku,'remark',remark])||public.romiku_search_snapshot(product_snapshot,'product_snapshot','product'))) stored;
create index romiku_packing_items_business_search_idx on public.romiku_packing_items using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_orders
  add column source_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored,
  add column source_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number])||public.romiku_search_snapshot(counterparty_snapshot,'counterparty_snapshot','party'))) stored;
create index romiku_orders_source_search_idx on public.romiku_orders using gin (source_search_text extensions.gin_trgm_ops);
create index if not exists romiku_customer_contacts_formal_customer_id_idx on public.romiku_customer_contacts(formal_customer_id);
create index if not exists romiku_production_items_production_order_id_idx on public.romiku_production_items(production_order_id);
create index if not exists romiku_packing_items_packing_list_id_idx on public.romiku_packing_items(packing_list_id);
create index if not exists romiku_quotes_formal_customer_id_idx on public.romiku_quotes(formal_customer_id);
create index if not exists romiku_quotes_outbound_company_id_idx on public.romiku_quotes(outbound_company_id);
create index if not exists romiku_quotes_source_website_inquiry_id_idx on public.romiku_quotes(source_website_inquiry_id);
create index if not exists romiku_pis_formal_customer_id_idx on public.romiku_pis(formal_customer_id);
create index if not exists romiku_pis_outbound_company_id_idx on public.romiku_pis(outbound_company_id);
create index if not exists romiku_pis_source_website_inquiry_id_idx on public.romiku_pis(source_website_inquiry_id);
create index if not exists romiku_pis_source_quote_id_idx on public.romiku_pis(source_quote_id);
create index if not exists romiku_orders_formal_customer_id_idx on public.romiku_orders(formal_customer_id);
create index if not exists romiku_orders_outbound_company_id_idx on public.romiku_orders(outbound_company_id);
create index if not exists romiku_orders_source_website_inquiry_id_idx on public.romiku_orders(source_website_inquiry_id);
create index if not exists romiku_orders_source_quote_id_idx on public.romiku_orders(source_quote_id);
create index if not exists romiku_orders_source_pi_id_idx on public.romiku_orders(source_pi_id);
create index if not exists romiku_formal_customers_source_outbound_company_id_idx on public.romiku_formal_customers(source_outbound_company_id);
create index if not exists romiku_production_followups_production_order_id_idx on public.romiku_production_followups(production_order_id);
create index if not exists romiku_manual_tasks_production_order_id_idx on public.romiku_manual_tasks(production_order_id);

revoke all on function public.romiku_global_search(text,text[],integer,integer,jsonb) from public,anon;
grant execute on function public.romiku_global_search(text,text[],integer,integer,jsonb) to authenticated;
revoke all on function public.romiku_search_snapshot(jsonb,text,text) from public,anon;
grant execute on function public.romiku_search_snapshot(jsonb,text,text) to authenticated,service_role;
revoke all on function public.romiku_search_fields(jsonb) from public,anon;
grant execute on function public.romiku_search_fields(jsonb) to authenticated,service_role;
revoke all on function public.romiku_search_text(jsonb) from public,anon;
grant execute on function public.romiku_search_text(jsonb) to authenticated,service_role;
revoke all on function public.romiku_search_matches(jsonb,text,text,text) from public,anon;
grant execute on function public.romiku_search_matches(jsonb,text,text,text) to authenticated,service_role;
revoke all on function public.romiku_search_date(date) from public,anon;
grant execute on function public.romiku_search_date(date) to authenticated,service_role;
revoke all on function public.romiku_search_date(timestamptz) from public,anon;
grant execute on function public.romiku_search_date(timestamptz) to authenticated,service_role;
revoke all on function public.romiku_search_join(text[]) from public,anon;
grant execute on function public.romiku_search_join(text[]) to authenticated,service_role;

revoke all on function public.romiku_marking_search_fields(jsonb) from public,anon;
grant execute on function public.romiku_marking_search_fields(jsonb) to authenticated,service_role;

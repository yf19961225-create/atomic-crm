-- Relationship-only aggregation. No customer history copies and no name matching.
create or replace view public.romiku_customer_document_membership with (security_invoker=true) as
with owned_orders as (select o.id,o.formal_customer_id customer_id,o.source_quote_id,o.source_pi_id,p.source_quote_id pi_quote_id from public.romiku_orders o left join public.romiku_pis p on p.id=o.source_pi_id where o.formal_customer_id is not null)
select formal_customer_id customer_id,'quote'::text resource_type,id record_id from public.romiku_quotes where formal_customer_id is not null
union select formal_customer_id,'pi',id from public.romiku_pis where formal_customer_id is not null
union select customer_id,'order',id from owned_orders
union select o.customer_id,'quote',q.id from owned_orders o join public.romiku_quotes q on q.id=o.source_quote_id or q.id=o.pi_quote_id where q.formal_customer_id is null or q.formal_customer_id=o.customer_id
union select o.customer_id,'pi',p.id from owned_orders o join public.romiku_pis p on p.id=o.source_pi_id where p.formal_customer_id is null or p.formal_customer_id=o.customer_id
union select o.customer_id,'production',p.id from owned_orders o join public.romiku_production_orders p on p.order_id=o.id
union select o.customer_id,'packing',p.id from owned_orders o join public.romiku_packing_lists p on p.order_id=o.id;
revoke all on public.romiku_customer_document_membership from public,anon;
grant select on public.romiku_customer_document_membership to authenticated,service_role;

create or replace view public.romiku_customer_document_rows with (security_invoker=true) as
select 'quote'::text resource_type,q.id,q.document_number,q.document_date::timestamptz document_date,q.created_at,q.status,q.currency,q.total,null::uuid order_id,null::text order_number,q.archived_at from public.romiku_quote_totals q
union all select 'pi',p.id,p.document_number,p.document_date::timestamptz,p.created_at,p.status,p.currency,p.total,null,null,p.archived_at from public.romiku_pi_totals p
union all select 'order',o.id,o.document_number,o.document_date::timestamptz,o.created_at,o.status,o.currency,o.total,o.id,o.document_number,o.archived_at from public.romiku_order_totals o
union all select 'production',p.id,p.document_number,p.created_at,p.created_at,p.status,null,null,p.order_id,o.document_number,p.archived_at from public.romiku_production_orders p join public.romiku_orders o on o.id=p.order_id
union all select 'packing',p.id,p.document_number,coalesce(p.packing_at,p.created_at),p.created_at,null,null,null,p.order_id,o.document_number,p.archived_at from public.romiku_packing_lists p left join public.romiku_orders o on o.id=p.order_id;
revoke all on public.romiku_customer_document_rows from public,anon;
grant select on public.romiku_customer_document_rows to authenticated,service_role;

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
 where q<>'' and 'packing'=any(types) and (status_filter is null or null::text=status_filter) and (order_filter is null or h.order_id=order_filter) and (h.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and h.business_search_text like '%'||search_phone||'%'))
 union all
select 'packing'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_packing_lists h join public.romiku_packing_items i on i.packing_list_id=h.id
 cross join lateral public.romiku_search_matches((select jsonb_object_agg('items.'||j.key,j.value) from jsonb_each(i.business_search_fields) j),q,pattern,search_phone) m
 where q<>'' and 'packing'=any(types) and (status_filter is null or null::text=status_filter) and (order_filter is null or h.order_id=order_filter) and (i.business_search_text like '%'||pattern||'%' escape E'\\' or (search_phone is not null and i.business_search_text like '%'||search_phone||'%'))
 union all
select 'packing'::text resource_type,h.id,h.document_number title,coalesce(h.name,'') subtitle,h.created_at,m.rank,m.matched_fields from public.romiku_packing_lists h join public.romiku_orders src on src.id=h.order_id cross join lateral public.romiku_search_matches(jsonb_build_object('source_order.document_number',lower(src.document_number)),q,pattern,null) m where q<>'' and 'packing'=any(types) and (status_filter is null or null::text=status_filter) and (order_filter is null or h.order_id=order_filter) and src.source_search_text like '%'||pattern||'%' escape E'\\'
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
 -- Evaluate the helper even for an empty resource list so validation is never skipped.
 if cardinality(types)=0 then perform 1 from public.romiku_business_search_hits(query,types,filters) limit 1; end if;
 with requested as (select t resource_type,min(n) position from unnest(types) with ordinality a(t,n) group by t),
 numbered as (select *,row_number() over(partition by resource_type order by rank,created_at desc,id) n,count(*) over(partition by resource_type) total_count from public.romiku_business_search_hits(query,types,filters))
 select jsonb_build_object('groups',coalesce(jsonb_agg(jsonb_build_object(
 'resource_type',r.resource_type,'total_count',coalesce(p.total_count,0),'limit',"limit",'offset',"offset",'has_more',coalesce(p.total_count,0)>("offset"::bigint+"limit"),'items',coalesce(p.items,'[]'::jsonb)) order by r.position),'[]'::jsonb)) into result
 from requested r left join lateral (select max(n.total_count) total_count,jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'subtitle',n.subtitle,'matched_fields',n.matched_fields,'rank',n.rank) order by n.n) filter(where n.n>"offset" and n.n<="offset"::bigint+"limit") items from numbered n where n.resource_type=r.resource_type) p on true;
 return result;
end $$;
revoke all on function public.romiku_business_search_hits(text,text[],jsonb) from public,anon;
grant execute on function public.romiku_business_search_hits(text,text[],jsonb) to authenticated,service_role;

create or replace function public.romiku_customer_documents(customer_id uuid,resource_type text default 'all',"limit" integer default 25,"offset" integer default 0,query text default '') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if customer_id is null or "limit" is null or "limit" not between 1 and 50 or "offset" is null or "offset"<0 or query is null or length(query)>500 or resource_type is null or resource_type not in ('all','quote','pi','order','production','packing') then raise exception 'Invalid history arguments' using errcode='22023'; end if;
 if not exists(select 1 from public.romiku_formal_customers c where c.id=customer_id) then raise exception 'Customer unavailable' using errcode='42501'; end if;
 with matches as materialized (select h.resource_type,h.id,h.rank from public.romiku_business_search_hits(query,array['quote','pi','order','production','packing'],jsonb_build_object('formal_customer_id',customer_id)) h where btrim(query)<>''),
 records as materialized (select d.*,coalesce(m.rank,9) relevance from public.romiku_customer_document_rows d join public.romiku_customer_document_membership cm on cm.record_id=d.id and cm.resource_type=d.resource_type and cm.customer_id=romiku_customer_documents.customer_id left join matches m on m.id=d.id and m.resource_type=d.resource_type where (romiku_customer_documents.resource_type='all' or d.resource_type=romiku_customer_documents.resource_type) and (btrim(query)='' or m.id is not null)),
 page as (select * from records order by relevance,document_date desc,created_at desc,id limit "limit" offset "offset")
 select jsonb_build_object('total_count',(select count(*) from records),'has_more',(select count(*) from records)>"offset"::bigint+"limit",'items',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('related_orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'document_number',o.document_number) order by o.document_date desc,o.id) from public.romiku_orders o left join public.romiku_pis pi on pi.id=o.source_pi_id where o.formal_customer_id=romiku_customer_documents.customer_id and ((p.resource_type='pi' and p.id=o.source_pi_id) or (p.resource_type='quote' and (p.id=o.source_quote_id or p.id=pi.source_quote_id)))),'[]')) order by relevance,document_date desc,created_at desc,id) from page p),'[]')) into result;
 return result;
end $$;

create or replace function public.romiku_customer_business_history(customer_id uuid,"limit" integer default 10,"offset" integer default 0,query text default '') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if customer_id is null or "limit" is null or "limit" not between 1 and 50 or "offset" is null or "offset"<0 or query is null or length(query)>500 then raise exception 'Invalid history arguments' using errcode='22023'; end if;
 if not exists(select 1 from public.romiku_formal_customers c where c.id=customer_id) then raise exception 'Customer unavailable' using errcode='42501'; end if;
 with owned as materialized (select o.* from public.romiku_order_totals o where o.formal_customer_id=customer_id),
 matches as materialized (select h.resource_type,h.id from public.romiku_business_search_hits(query,array['quote','pi','order','production','packing'],jsonb_build_object('formal_customer_id',customer_id)) h where btrim(query)<>''),
 filtered as materialized (select o.* from owned o left join public.romiku_pis pi on pi.id=o.source_pi_id where btrim(query)='' or exists(select 1 from matches m where (m.resource_type='order' and m.id=o.id) or (m.resource_type='quote' and (m.id=o.source_quote_id or m.id=pi.source_quote_id)) or (m.resource_type='pi' and m.id=o.source_pi_id)) or exists(select 1 from public.romiku_production_orders p join matches m on m.resource_type='production' and m.id=p.id where p.order_id=o.id) or exists(select 1 from public.romiku_packing_lists p join matches m on m.resource_type='packing' and m.id=p.id where p.order_id=o.id)),
 page as materialized (select * from filtered order by document_date desc,created_at desc,id limit "limit" offset "offset"),
 productions as (select p.order_id,jsonb_agg(jsonb_build_object('id',p.id,'document_number',p.document_number,'status',p.status,'matched',exists(select 1 from matches m where m.resource_type='production' and m.id=p.id)) order by p.created_at,p.id) items from public.romiku_production_orders p join page o on o.id=p.order_id group by p.order_id),
 packings as (select p.order_id,jsonb_agg(jsonb_build_object('id',p.id,'document_number',p.document_number,'matched',exists(select 1 from matches m where m.resource_type='packing' and m.id=p.id)) order by p.created_at,p.id) items from public.romiku_packing_lists p join page o on o.id=p.order_id group by p.order_id),
 payments as (select p.order_id,jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'amount',p.amount,'received_at',p.received_at,'payment_reference',p.payment_reference) order by p.received_at desc,p.id) items from public.romiku_payments p join page o on o.id=p.order_id group by p.order_id),
 cards as (select o.id,o.document_number,o.document_date,o.created_at,o.status,o.archived_at,o.currency,o.total,
 coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'document_number',q.document_number,'customer_conflict',q.formal_customer_id is not null and q.formal_customer_id<>customer_id) order by q.id) from public.romiku_quotes q where q.id=o.source_quote_id or q.id=pi.source_quote_id),'[]') source_quotes,
 case when pi.id is null then null else jsonb_build_object('id',pi.id,'document_number',pi.document_number,'customer_conflict',pi.formal_customer_id is not null and pi.formal_customer_id<>customer_id) end source_pi,
 coalesce(p.items,'[]') productions,coalesce(pl.items,'[]') packings,coalesce(pay.items,'[]') payments,
 jsonb_build_object('total',o.total,'paid',o.received_amount,'balance',o.remaining_amount) payment_summary
 from page o left join public.romiku_pis pi on pi.id=o.source_pi_id left join productions p on p.order_id=o.id left join packings pl on pl.order_id=o.id left join payments pay on pay.order_id=o.id)
 select jsonb_build_object('total_count',(select count(*) from filtered),'has_more',(select count(*) from filtered)>"offset"::bigint+"limit",'orders',coalesce((select jsonb_agg(to_jsonb(c) order by document_date desc,created_at desc,id) from cards c),'[]'),
 'summary',jsonb_build_object('order_count',(select count(*) from owned),'in_progress',(select count(*) from owned where status in ('confirmed','in_production','ready_to_ship','shipped')),'completed',(select count(*) from owned where status='completed'),'totals',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) order by currency) from (select currency,sum(total) amount from owned where status<>'cancelled' group by currency) t),'[]'),'latest',(select jsonb_build_object('id',id,'document_number',document_number,'document_date',document_date) from owned order by document_date desc,created_at desc,id limit 1))) into result;
 return result;
end $$;

create or replace function public.romiku_customer_archive_plan(order_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare o public.romiku_orders; pi public.romiku_pis; docs jsonb; q_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into o from public.romiku_orders where id=order_id;
 if not found then raise exception '订单不存在或无权访问。' using errcode='42501'; end if;
 if o.source_pi_id is not null then
  select * into pi from public.romiku_pis where id=o.source_pi_id;
  if not found then raise exception '来源 PI 不可访问，不能确认归档。' using errcode='42501'; end if;
 end if;
 select count(*) into q_count from public.romiku_quotes q where q.id=o.source_quote_id or q.id=pi.source_quote_id;
 if q_count<>(select count(distinct id) from unnest(array[o.source_quote_id,pi.source_quote_id]) id where id is not null) then raise exception '来源报价单不可访问，不能确认归档。' using errcode='42501'; end if;
 select jsonb_agg(d order by d->>'resource_type',d->>'id') into docs from (
 select jsonb_build_object('resource_type','order','id',o.id,'document_number',o.document_number,'formal_customer_id',o.formal_customer_id,'source_quote_id',o.source_quote_id,'source_pi_id',o.source_pi_id) d
 union all select jsonb_build_object('resource_type','pi','id',pi.id,'document_number',pi.document_number,'formal_customer_id',pi.formal_customer_id,'source_quote_id',pi.source_quote_id) where pi.id is not null
 union all select jsonb_build_object('resource_type','quote','id',q.id,'document_number',q.document_number,'formal_customer_id',q.formal_customer_id) from public.romiku_quotes q where q.id=o.source_quote_id or q.id=pi.source_quote_id) x;
 return jsonb_build_object('documents',docs,'token',md5(docs::text));
end $$;

create or replace function public.romiku_confirm_customer_archive(order_id uuid,customer_id uuid,include_history boolean,expected_token text,new_customer_name text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare plan jsonb; doc jsonb; target uuid:=customer_id; changed integer; expected_count integer;
begin
 if auth.uid() is null then raise exception '请先登录。' using errcode='42501'; end if;
 if include_history is null or expected_token is null then raise exception '请先预览并确认归档范围。' using errcode='22023'; end if;
 if (customer_id is null)=(nullif(btrim(new_customer_name),'') is null) then raise exception '请选择已有客户或明确填写新客户名称。' using errcode='22023'; end if;
 perform 1 from public.romiku_orders o where o.id=order_id for update;
 plan:=public.romiku_customer_archive_plan(order_id);
 perform 1 from public.romiku_pis p where p.id in (select (d->>'id')::uuid from jsonb_array_elements(plan->'documents') d where d->>'resource_type'='pi') order by p.id for update;
 perform 1 from public.romiku_quotes q where q.id in (select (d->>'id')::uuid from jsonb_array_elements(plan->'documents') d where d->>'resource_type'='quote') order by q.id for update;
 plan:=public.romiku_customer_archive_plan(order_id);
 if plan->>'token'<>expected_token then raise exception '来源或客户关联已变化，请重新预览后确认。' using errcode='40001'; end if;
 if target is null then
  if length(btrim(new_customer_name))>200 then raise exception '客户名称过长。' using errcode='22023'; end if;
  insert into public.romiku_formal_customers(name) values(btrim(new_customer_name)) returning id into target;
 else
  perform 1 from public.romiku_formal_customers c where c.id=target for key share;
  if not found then raise exception '客户不存在或无权访问。' using errcode='42501'; end if;
 end if;
 for doc in select d from jsonb_array_elements(plan->'documents') d where include_history or d->>'resource_type'='order' loop
  if doc->>'formal_customer_id' is not null and (doc->>'formal_customer_id')::uuid<>target then raise exception '来源链已有单据关联其他客户，不能自动覆盖。' using errcode='23514'; end if;
  if doc->>'resource_type' in ('quote','pi') and exists(select 1 from public.romiku_orders o left join public.romiku_pis p on p.id=o.source_pi_id where o.formal_customer_id is not null and o.formal_customer_id<>target and ((doc->>'resource_type'='pi' and o.source_pi_id=(doc->>'id')::uuid) or (doc->>'resource_type'='quote' and ((doc->>'id')::uuid=o.source_quote_id or (doc->>'id')::uuid=p.source_quote_id)))) then raise exception '来源单据还关联其他客户的订单，不能自动归档。' using errcode='23514'; end if;
  case doc->>'resource_type'
   when 'order' then update public.romiku_orders set formal_customer_id=target where id=(doc->>'id')::uuid;
   when 'pi' then update public.romiku_pis set formal_customer_id=target where id=(doc->>'id')::uuid;
   when 'quote' then update public.romiku_quotes set formal_customer_id=target where id=(doc->>'id')::uuid;
  end case;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '无权更新来源链，归档已全部撤销。' using errcode='42501'; end if;
 end loop;
 return jsonb_build_object('ok',true,'customer_id',target);
end $$;
revoke all on function public.romiku_customer_documents(uuid,text,integer,integer,text),public.romiku_customer_business_history(uuid,integer,integer,text),public.romiku_customer_archive_plan(uuid),public.romiku_confirm_customer_archive(uuid,uuid,boolean,text,text) from public,anon;
grant execute on function public.romiku_customer_documents(uuid,text,integer,integer,text),public.romiku_customer_business_history(uuid,integer,integer,text),public.romiku_customer_archive_plan(uuid),public.romiku_confirm_customer_archive(uuid,uuid,boolean,text,text) to authenticated;

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

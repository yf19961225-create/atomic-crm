-- Add the manual awaiting-payment order stage to customer in-progress statistics.
-- No row updates, signature, owner, security mode, RLS or ACL changes.
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
 payments as (select p.order_id,jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'amount',p.amount,'received_at',p.received_at,'payment_reference',p.payment_reference,'status',p.status,'created_at',p.created_at,'payment_account',p.payment_account,'voided_at',p.voided_at,'voided_by_label',p.voided_by_label,'void_reason',p.void_reason) order by p.received_at desc,p.id) items from public.romiku_payments p join page o on o.id=p.order_id group by p.order_id),
 cards as (select o.id,o.document_number,o.document_date,o.created_at,o.status,o.archived_at,o.currency,o.total,
 coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'document_number',q.document_number,'customer_conflict',q.formal_customer_id is not null and q.formal_customer_id<>customer_id) order by q.id) from public.romiku_quotes q where q.id=o.source_quote_id or q.id=pi.source_quote_id),'[]') source_quotes,
 case when pi.id is null then null else jsonb_build_object('id',pi.id,'document_number',pi.document_number,'customer_conflict',pi.formal_customer_id is not null and pi.formal_customer_id<>customer_id) end source_pi,
 coalesce(p.items,'[]') productions,coalesce(pl.items,'[]') packings,coalesce(pay.items,'[]') payments,
 jsonb_build_object('total',o.total,'paid',o.received_amount,'balance',o.remaining_amount) payment_summary
 from page o left join public.romiku_pis pi on pi.id=o.source_pi_id left join productions p on p.order_id=o.id left join packings pl on pl.order_id=o.id left join payments pay on pay.order_id=o.id)
 select jsonb_build_object('total_count',(select count(*) from filtered),'has_more',(select count(*) from filtered)>"offset"::bigint+"limit",'orders',coalesce((select jsonb_agg(to_jsonb(c) order by document_date desc,created_at desc,id) from cards c),'[]'),
 'summary',jsonb_build_object('order_count',(select count(*) from owned),'in_progress',(select count(*) from owned where status in ('confirmed','in_production','ready_to_ship','shipped','awaiting_payment')),'completed',(select count(*) from owned where status='completed'),'totals',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) order by currency) from (select currency,sum(total) amount from owned where status not in ('cancelled','voided') group by currency) t),'[]'),'latest',(select jsonb_build_object('id',id,'document_number',document_number,'document_date',document_date) from owned order by document_date desc,created_at desc,id limit 1))) into result;
 return result;
end $$;

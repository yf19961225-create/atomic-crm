-- Counts include every status. Customer-owned contacts are intentionally excluded.
create or replace function public.romiku_customer_dependencies(record_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'quotes',(select count(*) from public.romiku_quotes where formal_customer_id=record_id),
 'pi',(select count(*) from public.romiku_pis where formal_customer_id=record_id),
 'orders',(select count(*) from public.romiku_orders where formal_customer_id=record_id),
 'website_inquiries',(select count(*) from public.romiku_website_inquiries where formal_customer_id=record_id),
 'manual_tasks',(select count(*) from public.romiku_manual_tasks where formal_customer_id=record_id),
 'outbound',(select count(*) from public.romiku_formal_customers where id=record_id and source_outbound_company_id is not null),
 'production',(select count(*) from public.romiku_production_orders p join public.romiku_orders o on o.id=p.order_id where o.formal_customer_id=record_id),
 'packing',(select count(*) from public.romiku_packing_lists p join public.romiku_orders o on o.id=p.order_id where o.formal_customer_id=record_id),
 'payments',(select count(*) from public.romiku_payments p join public.romiku_orders o on o.id=p.order_id where o.formal_customer_id=record_id));
$$;
revoke all on function public.romiku_customer_dependencies(uuid) from public,anon;
grant execute on function public.romiku_customer_dependencies(uuid) to authenticated;
revoke delete on public.romiku_formal_customers from authenticated;

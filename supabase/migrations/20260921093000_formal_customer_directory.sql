create or replace view public.romiku_formal_customer_directory
with (security_invoker = true) as
select
  customer.id,
  customer.name,
  customer.country,
  customer.logistics,
  outbound.brand_name as brand,
  outbound.city,
  contact.name as contact,
  contact.email,
  contact.phone,
  contact.whatsapp,
  lower(concat_ws(' ', customer.name, customer.country, outbound.brand_name, outbound.city, contact.name)) as search_text
from public.romiku_formal_customers customer
left join public.romiku_outbound_companies outbound on outbound.id = customer.source_outbound_company_id
left join lateral (
  select name, email, phone, whatsapp
  from public.romiku_customer_contacts
  where formal_customer_id = customer.id and is_active = true
  order by is_primary desc, created_at asc
  limit 1
) contact on true;

revoke all on public.romiku_formal_customer_directory from public, anon;
grant select on public.romiku_formal_customer_directory to authenticated, service_role;

--
-- Views
-- This file declares all views in the public schema.
--

create or replace view public.activity_log with (security_invoker = on) as
select
    ('company.' || c.id || '.created') as id,
    'company.created' as type,
    c.created_at as date,
    c.id as company_id,
    c.sales_id,
    to_json(c.*) as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.companies c
union all
select
    ('contact.' || co.id || '.created') as id,
    'contact.created' as type,
    co.first_seen as date,
    co.company_id,
    co.sales_id,
    null::json as company,
    to_json(co.*) as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.contacts co
union all
select
    ('contactNote.' || cn.id || '.created') as id,
    'contactNote.created' as type,
    cn.date,
    co.company_id,
    cn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    to_json(cn.*) as contact_note,
    null::json as deal_note
from public.contact_notes cn
    left join public.contacts co on co.id = cn.contact_id
union all
select
    ('deal.' || d.id || '.created') as id,
    'deal.created' as type,
    d.created_at as date,
    d.company_id,
    d.sales_id,
    null::json as company,
    null::json as contact,
    to_json(d.*) as deal,
    null::json as contact_note,
    null::json as deal_note
from public.deals d
union all
select
    ('dealNote.' || dn.id || '.created') as id,
    'dealNote.created' as type,
    dn.date,
    d.company_id,
    dn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    to_json(dn.*) as deal_note
from public.deal_notes dn
    left join public.deals d on d.id = dn.deal_id;

create or replace view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    count(distinct d.id) as nb_deals,
    count(distinct co.id) as nb_contacts
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    count(distinct t.id) filter (where t.done_date is null) as nb_tasks
from public.contacts co
    left join public.tasks t on co.id = t.contact_id
    left join public.companies c on co.company_id = c.id
group by co.id, c.name;

create or replace view public.init_state with (security_invoker = off) as
select count(sub.id) as is_initialized
from (
    select sales.id from public.sales limit 1
) sub;

-- ROMIKU derived views always evaluate underlying RLS as the caller.

create or replace view public.romiku_quote_totals with (security_invoker = true) as
select d.*, coalesce(i.subtotal,0) as subtotal,
    coalesce(i.subtotal,0) + d.freight + d.other_expenses - d.discount as total
    from public.romiku_quotes d
    left join (select quote_id, sum(amount) as subtotal from public.romiku_quote_items group by quote_id) i on i.quote_id = d.id;

create or replace view public.romiku_pi_totals with (security_invoker = true) as
select d.*, coalesce(i.subtotal,0) as subtotal,
    coalesce(i.subtotal,0) + d.freight + d.other_expenses - d.discount as total
    from public.romiku_pis d
    left join (select pi_id, sum(amount) as subtotal from public.romiku_pi_items group by pi_id) i on i.pi_id = d.id;

create or replace view public.romiku_order_totals with (security_invoker = true) as
select b.*,coalesce(p.received_amount,0) as received_amount,
    b.total - coalesce(p.received_amount,0) as remaining_amount,
    round(b.total * b.deposit_percent / 100,2) as expected_deposit,
    greatest(round(b.total * b.deposit_percent / 100,2) - coalesce(p.deposit_received,0),0) as deposit_remaining
    from (select d.*, coalesce(i.subtotal,0) as subtotal,
    coalesce(i.subtotal,0) + d.freight + d.other_expenses - d.discount as total
    from public.romiku_orders d
    left join (select order_id, sum(amount) as subtotal from public.romiku_order_items group by order_id) i on i.order_id = d.id) b
    left join (select order_id,sum(amount) as received_amount,sum(amount) filter (where kind='deposit') as deposit_received
      from public.romiku_payments group by order_id) p on p.order_id=b.id;

create or replace view public.romiku_order_item_remaining with (security_invoker = true) as
select i.id,i.order_id,i.sku,i.quantity as ordered_quantity,
    coalesce(p.quantity,0) as packed_quantity,i.quantity-coalesce(p.quantity,0) as remaining_quantity,
    coalesce(w.quantity,0) as production_quantity,i.quantity-coalesce(w.quantity,0) as unallocated_quantity
    from public.romiku_order_items i
    left join (select source_order_item_id,sum(quantity) as quantity from public.romiku_packing_items group by source_order_item_id) p on p.source_order_item_id=i.id
    left join (select source_order_item_id,sum(quantity) as quantity from public.romiku_production_items group by source_order_item_id) w on w.source_order_item_id=i.id;

create or replace view public.romiku_packing_totals with (security_invoker = true) as
select p.*,coalesce(i.total_cartons,0) as total_cartons,coalesce(i.total_cbm,0) as total_cbm,coalesce(i.total_weight_kg,0) as total_weight_kg
    from public.romiku_packing_lists p
    left join (select packing_list_id,sum(cartons) as total_cartons,sum(total_cbm) as total_cbm,sum(total_weight_kg) as total_weight_kg
      from public.romiku_packing_items group by packing_list_id) i on i.packing_list_id=p.id;

create or replace view public.romiku_outbound_summary with (security_invoker = true) as
select c.*,coalesce(f.follow_up_count,0) as follow_up_count,f.last_contact_at
    from public.romiku_outbound_companies c
    left join (select outbound_company_id,count(*) as follow_up_count,max(contacted_at) as last_contact_at
      from public.romiku_outbound_followups group by outbound_company_id) f on f.outbound_company_id=c.id;

create or replace view public.romiku_current_reference_cost with (security_invoker = true) as
select distinct on (product_supplier_id,currency) *
    from public.romiku_procurement_cost_history where effective_date <= current_date
    order by product_supplier_id,currency,effective_date desc,created_at desc,id desc;

create or replace view public.romiku_calendar with (security_invoker = true) as
select 'inquiry_follow_up:' || id::text as id,'inquiry_follow_up'::text as event_type,'romiku_website_inquiries'::text as source_table,
    id as source_id,document_number as title,next_follow_up_at as due_at,owner_id,status as status
    from public.romiku_website_inquiries where next_follow_up_at is not null and archived_at is null and status not in ('processed','invalid')
union all
select 'outbound_follow_up:' || id::text as id,'outbound_follow_up'::text as event_type,'romiku_outbound_companies'::text as source_table,
    id as source_id,name as title,next_follow_up_at as due_at,owner_id,status as status
    from public.romiku_outbound_companies where next_follow_up_at is not null and archived_at is null and status not in ('paused','invalid')
union all
select 'quote_follow_up:' || id::text as id,'quote_follow_up'::text as event_type,'romiku_quotes'::text as source_table,
    id as source_id,document_number as title,follow_up_at as due_at,owner_id,status as status
    from public.romiku_quotes where follow_up_at is not null and archived_at is null
union all
select 'quote_due:' || id::text as id,'quote_due'::text as event_type,'romiku_quotes'::text as source_table,
    id as source_id,document_number as title,due_at as due_at,owner_id,status as status
    from public.romiku_quotes where due_at is not null and archived_at is null
union all
select 'pi_follow_up:' || id::text as id,'pi_follow_up'::text as event_type,'romiku_pis'::text as source_table,
    id as source_id,document_number as title,follow_up_at as due_at,owner_id,status as status
    from public.romiku_pis where follow_up_at is not null and archived_at is null
union all
select 'pi_due:' || id::text as id,'pi_due'::text as event_type,'romiku_pis'::text as source_table,
    id as source_id,document_number as title,due_at as due_at,owner_id,status as status
    from public.romiku_pis where due_at is not null and archived_at is null
union all
select 'order_delivery:' || id::text as id,'order_delivery'::text as event_type,'romiku_orders'::text as source_table,
    id as source_id,document_number as title,expected_delivery_at as due_at,owner_id,status as status
    from public.romiku_orders where expected_delivery_at is not null and archived_at is null and actual_delivery_at is null
union all
select 'production_due:' || id::text as id,'production_due'::text as event_type,'romiku_production_orders'::text as source_table,
    id as source_id,document_number as title,factory_due_at as due_at,owner_id,status as status
    from public.romiku_production_orders where factory_due_at is not null and archived_at is null and status not in ('completed','received','cancelled')
union all
select 'packing:' || id::text as id,'packing'::text as event_type,'romiku_packing_lists'::text as source_table,
    id as source_id,document_number as title,packing_at as due_at,owner_id,'scheduled'::text as status
    from public.romiku_packing_lists where packing_at is not null and archived_at is null
union all
select 'manual_task:' || id::text as id,'manual_task'::text as event_type,'romiku_manual_tasks'::text as source_table,
    id as source_id,title as title,due_at as due_at,owner_id,case when completed_at is null then 'pending' else 'completed' end as status
    from public.romiku_manual_tasks where due_at is not null and completed_at is null;

create or replace view public.romiku_workbench with (security_invoker = true) as
select e.*,e.due_at < now() as is_overdue from public.romiku_calendar e
union all
select 'inquiry_new:'||id::text,'inquiry_new','romiku_website_inquiries',id,document_number,submitted_at,owner_id,status,false
  from public.romiku_website_inquiries where status in ('new','pending') and archived_at is null
union all
select 'production_anomaly:'||id::text,'production_anomaly','romiku_production_orders',id,document_number,factory_due_at,owner_id,status,
  coalesce(factory_due_at < now(),false)
  from public.romiku_production_orders where cardinality(anomaly_flags)>0 and archived_at is null
union all
select 'order_receivable:'||id::text,'order_receivable','romiku_orders',id,document_number,
  case when deposit_remaining>0 then deposit_due_at else balance_due_at end,owner_id,status,
  coalesce(case when deposit_remaining>0 then deposit_due_at else balance_due_at end < now(),false)
  from public.romiku_order_totals where remaining_amount>0 and archived_at is null;

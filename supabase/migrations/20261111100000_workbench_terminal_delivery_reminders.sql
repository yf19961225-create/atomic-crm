-- LOCAL VALIDATION ONLY: remote execution requires separate authorization.
-- Preserve ACL/owner/security invoker; no business record updates.
create or replace view public.romiku_calendar with (security_invoker = true) as
select 'inquiry_follow_up:' || id::text as id,'inquiry_follow_up'::text as event_type,'romiku_website_inquiries'::text as source_table,
    id as source_id,document_number as title,next_follow_up_at as due_at,owner_id,status as status
    from public.romiku_website_inquiries where next_follow_up_at is not null and archived_at is null and status not in ('won','invalid')
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
    from public.romiku_orders where expected_delivery_at is not null and archived_at is null and actual_delivery_at is null and status in ('confirmed','in_production','ready_to_ship')
union all
select 'production_due:' || id::text as id,'production_due'::text as event_type,'romiku_production_orders'::text as source_table,
    id as source_id,document_number as title,factory_due_at as due_at,owner_id,status as status
    from public.romiku_production_orders where factory_due_at is not null and archived_at is null and status not in ('received','cancelled')
union all
select 'packing:' || id::text as id,'packing'::text as event_type,'romiku_packing_lists'::text as source_table,
    id as source_id,document_number as title,packing_at as due_at,owner_id,status
    from public.romiku_packing_lists where packing_at is not null and archived_at is null
union all
select 'manual_task:' || id::text as id,'manual_task'::text as event_type,'romiku_manual_tasks'::text as source_table,
    id as source_id,title as title,due_at as due_at,owner_id,case when completed_at is null then 'pending' else 'completed' end as status
    from public.romiku_manual_tasks where due_at is not null and completed_at is null;

create or replace view public.romiku_workbench with (security_invoker = true) as
select e.*,e.due_at < now() as is_overdue from public.romiku_calendar e
union all
select 'inquiry_new:'||id::text,'inquiry_new','romiku_website_inquiries',id,document_number,submitted_at,owner_id,status,false
  from public.romiku_website_inquiries where status in ('pending_screening','pending_contact') and archived_at is null
union all
select 'production_anomaly:'||id::text,'production_anomaly','romiku_production_orders',id,document_number,factory_due_at,owner_id,status,
  coalesce(factory_due_at < now(),false)
  from public.romiku_production_orders where cardinality(anomaly_flags)>0 and archived_at is null and status not in ('received','cancelled')
union all
select 'order_receivable:'||id::text,'order_receivable','romiku_orders',id,document_number,
  case when deposit_remaining>0 then deposit_due_at else balance_due_at end,owner_id,status,
  coalesce(case when deposit_remaining>0 then deposit_due_at else balance_due_at end < now(),false)
  from public.romiku_order_totals where remaining_amount>0 and archived_at is null and status<>'voided';

create or replace function public.romiku_workbench_feed(p_tab text default 'recent',p_search text default '',p_kind text default '',p_status text default '',p_limit integer default 8,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.romiku_wb_active() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or p_tab not in ('recent','collection','arrange','all') then raise exception 'INVALID_PAGE'; end if;
 with orders as (
  select o.*,coalesce(s.customer_confirmation,'unknown') cc,coalesce(s.deposit_override,'none') override,
   coalesce(s.needs_follow_up,false) needs_follow_up,s.next_follow_up_on,coalesce(s.revision,0) revision
  from public.romiku_order_totals o left join public.romiku_order_collection_state s on s.order_id=o.id
  where o.archived_at is null and o.status not in ('cancelled','voided')
 ), cash as (
  select o.*,case when deposit_percent=100 then 'prepayment' when override<>'accepted' and deposit_remaining>0 then 'deposit' else 'balance' end phase
  from orders o where cc='confirmed' and status<>'draft' and remaining_amount>0
 ), children as (
  select p.id,p.order_id,p.document_number,p.status,p.factory_due_at,
   coalesce(s.due_classification,case when p.factory_due_at is null then 'unclassified' else 'confirmed' end) classification,
   coalesce(s.revision,0) revision,coalesce(s.needs_follow_up,false) needs_follow_up,s.next_follow_up_on
  from public.romiku_production_orders p left join public.romiku_production_due_state s on s.production_order_id=p.id
  where p.archived_at is null and p.status not in ('received','cancelled')
 ), groups as (
  select o.id,o.document_number,o.document_name,count(*) child_count,
   least(min((c.factory_due_at at time zone 'Asia/Shanghai')::date) filter(where c.classification='confirmed'),min(c.next_follow_up_on)) due,
   count(*) filter(where c.classification in ('unclassified','needs_confirmation')) arrange_count,
   bool_or(c.needs_follow_up or c.next_follow_up_on<=(now() at time zone 'Asia/Shanghai')::date) urgent,
   jsonb_agg(to_jsonb(c) order by c.document_number,c.id) children
  from children c join orders o on o.id=c.order_id group by o.id,o.document_number,o.document_name
 ), tasks as (
  select 'collection:'||c.id id,'collection'::text kind,'romiku_orders'::text source_table,c.id source_id,
   coalesce(nullif(c.document_name,''),c.document_number) title,c.document_number,c.phase status,
   least(c.next_follow_up_on,(case when phase in ('deposit','prepayment') then deposit_due_at else balance_due_at end at time zone 'Asia/Shanghai')::date) due,
   (c.needs_follow_up or coalesce(c.next_follow_up_on<=(now() at time zone 'Asia/Shanghai')::date,false) or coalesce((case when phase in ('deposit','prepayment') then deposit_due_at else balance_due_at end at time zone 'Asia/Shanghai')::date < (now() at time zone 'Asia/Shanghai')::date,false)) urgent,false arrange,
   jsonb_build_object('amount',case when phase='deposit' then least(deposit_remaining,remaining_amount) else remaining_amount end,'currency',currency,'revision',revision) extra
  from cash c
  union all
  select 'verification:'||o.id,'verification','romiku_orders',o.id,coalesce(nullif(document_name,''),document_number),document_number,cc,null::date,false,true,
   jsonb_build_object('amount',remaining_amount,'currency',currency,'revision',revision)
  from orders o where cc='unknown' and remaining_amount>0
  union all
  select 'deferred:'||o.id,'deferred','romiku_orders',o.id,coalesce(nullif(document_name,''),document_number),document_number,case when status='draft' then 'draft' else cc end,null::date,false,false,
   jsonb_build_object('amount',remaining_amount,'currency',currency,'revision',revision)
  from orders o where remaining_amount>0 and cc<>'unknown' and (cc='unconfirmed' or status='draft')
  union all
  select 'production:'||g.id,'production','romiku_orders',g.id,coalesce(nullif(document_name,''),document_number),document_number,
   case when arrange_count>0 then 'needs_action' else 'scheduled' end,due,urgent,arrange_count>0,
   jsonb_build_object('child_count',child_count,'children',children,'arrange_count',arrange_count)
  from groups g
  union all
  select 'inquiry:'||i.id,'inquiry','romiku_website_inquiries',i.id,i.document_number,i.document_number,i.status,(i.next_follow_up_at at time zone 'Asia/Shanghai')::date,i.status='pending_screening',i.next_follow_up_at is null,'{}'::jsonb
  from public.romiku_website_inquiries i where i.archived_at is null and i.status in ('pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply')
  union all
  select 'quote:'||q.id,'quote','romiku_quotes',q.id,coalesce(nullif(q.document_name,''),q.document_number),q.document_number,q.status,(least(q.follow_up_at,q.due_at) at time zone 'Asia/Shanghai')::date,false,q.follow_up_at is null and q.due_at is null,'{}'
  from public.romiku_quotes q where q.archived_at is null and q.status in ('pending_quote','sent')
  union all
  select 'pi:'||q.id,'pi','romiku_pis',q.id,coalesce(nullif(q.document_name,''),q.document_number),q.document_number,q.status,(least(q.follow_up_at,q.due_at) at time zone 'Asia/Shanghai')::date,false,q.follow_up_at is null and q.due_at is null,'{}'
  from public.romiku_pis q where q.archived_at is null and q.status in ('draft','sent')
  union all
  select 'packing:'||p.id,'packing','romiku_packing_lists',p.id,p.document_number,p.document_number,p.status,(p.packing_at at time zone 'Asia/Shanghai')::date,false,p.packing_at is null,'{}'
  from public.romiku_packing_lists p where p.archived_at is null
  union all
  select 'task:'||t.id,'task','romiku_manual_tasks',t.id,t.title,null,'pending',(t.due_at at time zone 'Asia/Shanghai')::date,t.priority in ('urgent','high'),t.due_at is null,'{}'
  from public.romiku_manual_tasks t where t.completed_at is null
  union all
  select e.id,e.event_type,e.source_table,e.source_id,e.title,null,e.status,(e.due_at at time zone 'Asia/Shanghai')::date,e.event_type='production_anomaly',false,'{}'
  from public.romiku_workbench e where e.event_type in ('outbound_follow_up','order_delivery','production_anomaly') and (e.event_type<>'order_delivery' or e.status in ('confirmed','in_production','ready_to_ship'))
 ), classified as (
  select t.*, (urgent or kind<>'collection' and due < (now() at time zone 'Asia/Shanghai')::date+7) and kind not in ('verification','deferred') recent
  from tasks t
 ), filtered as (
  select * from classified t where
   (p_tab='all' or p_tab='recent' and recent or p_tab='collection' and kind='collection' or p_tab='arrange' and arrange)
   and (coalesce(p_kind,'')='' or kind=p_kind) and (coalesce(p_status,'')='' or status=p_status)
   and (coalesce(p_search,'')='' or strpos(lower(coalesce(title,'')||' '||coalesce(document_number,'')),lower(p_search))>0)
 ), page as (
  select * from filtered order by case when due < (now() at time zone 'Asia/Shanghai')::date then 0 when urgent then 1 else 2 end,due nulls last,id limit p_limit offset p_offset
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg((to_jsonb(p)-'extra')||p.extra order by case when due < (now() at time zone 'Asia/Shanghai')::date then 0 when urgent then 1 else 2 end,due nulls last,id) from page p),'[]'),
  'total',(select count(*) from filtered),'counts',jsonb_build_object('all',(select count(*) from classified),'recent',(select count(*) from classified where recent),'collection',(select count(*) from classified where kind='collection'),'arrange',(select count(*) from classified where arrange)),
  'unknown_total',(select count(*) from orders where cc='unknown' and remaining_amount>0),
  'potential_receivables',coalesce((select jsonb_agg(to_jsonb(v) order by currency) from (select currency,sum(remaining_amount) amount from orders where cc='unknown' and remaining_amount>0 group by currency) v),'[]'),
  'raw_count',(select coalesce(sum(case when kind='production' then (extra->>'child_count')::int else 1 end),0) from classified)) into result;
 return result;
end $$;

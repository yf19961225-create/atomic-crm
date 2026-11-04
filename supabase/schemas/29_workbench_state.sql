-- Workbench state and audit. Additive; no historical backfill.
do $$
begin
 if exists(select 1 from pg_roles where rolname='romiku_workbench_executor') then
  if exists(select 1 from pg_roles where rolname='romiku_workbench_executor' and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)) then
   raise exception 'Unsafe workbench executor role';
  end if;
 else
  create role romiku_workbench_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 end if;
end $$;
-- Inherited authenticated policies; no client can SET ROLE to the executor.
alter role romiku_workbench_executor inherit;
grant authenticated to romiku_workbench_executor;
grant usage on schema public,auth to romiku_workbench_executor;

create table public.romiku_workbench_requests (
 request_id uuid primary key, actor_id uuid, action text not null,
 entity_type text not null check(entity_type in ('order','production')), entity_id uuid not null,
 payload_hash text not null check(length(payload_hash)=64), result jsonb not null check(jsonb_typeof(result)='object'),
 created_at timestamptz not null default clock_timestamp(), transaction_id bigint not null default txid_current()
);
create table public.romiku_workbench_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.romiku_workbench_requests(request_id) deferrable initially deferred,
 event_index integer not null check(event_index>0),
 entity_type text not null check(entity_type in ('order','production')), entity_id uuid not null,
 action text not null, actor_id uuid, actor_source text not null check(actor_source in ('user','system')),
 occurred_at timestamptz not null default clock_timestamp(),
 before_state jsonb not null check(jsonb_typeof(before_state)='object'),
 after_state jsonb not null check(jsonb_typeof(after_state)='object'),
 evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object'),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 reverses_event_id uuid references public.romiku_workbench_events(id),
 unique(request_id,event_index), check(actor_source<>'user' or actor_id is not null)
);
create index romiku_wb_events_entity_time on public.romiku_workbench_events(entity_type,entity_id,occurred_at desc,id);
create table public.romiku_order_collection_state (
 order_id uuid primary key references public.romiku_orders(id) on delete cascade,
 customer_confirmation text not null default 'unknown' check(customer_confirmation in ('unknown','unconfirmed','confirmed')),
 deposit_override text not null default 'none' check(deposit_override in ('none','accepted','invalidated','revoked')),
 deposit_event_id uuid references public.romiku_workbench_events(id),
 needs_follow_up boolean not null default false, next_follow_up_on date,
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default clock_timestamp(), updated_by uuid,
 check(deposit_override='none' or deposit_event_id is not null),
 check(deposit_override<>'accepted' or customer_confirmation='confirmed')
);
create index romiku_wb_collection_follow_up on public.romiku_order_collection_state(next_follow_up_on,order_id);
create table public.romiku_production_due_state (
 production_order_id uuid primary key references public.romiku_production_orders(id) on delete cascade,
 due_classification text not null check(due_classification in ('unclassified','needs_confirmation','confirmed','not_required')),
 needs_follow_up boolean not null default false, next_follow_up_on date,
 revision bigint not null default 0 check(revision>=0), updated_at timestamptz not null default clock_timestamp(), updated_by uuid
);
create table public.romiku_deposit_evidence (
 event_id uuid not null references public.romiku_workbench_events(id), payment_id uuid not null,
 primary key(event_id,payment_id)
);
create index romiku_wb_evidence_payment on public.romiku_deposit_evidence(payment_id,event_id);

create function public.romiku_wb_active() returns boolean
 language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.role(),'')='authenticated'
 and exists(select 1 from public.sales s where s.user_id=auth.uid() and not s.disabled)
$$;
create function public.romiku_wb_visible(entity_type text,entity_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select public.romiku_wb_active() and case entity_type
 when 'order' then exists(select 1 from public.romiku_orders where id=entity_id)
 when 'production' then exists(select 1 from public.romiku_production_orders p
  join public.romiku_orders o on o.id=p.order_id where p.id=entity_id)
 else false end
$$;
create function public.romiku_wb_manage(entity_type text,entity_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select public.romiku_wb_visible(entity_type,entity_id)
 and has_table_privilege('authenticated',case entity_type when 'order' then 'public.romiku_orders' else 'public.romiku_production_orders' end,'UPDATE')
 -- Fail closed if the audited UPDATE policy changes. Never infer UPDATE from SELECT.
 and exists(select 1 from pg_catalog.pg_policy p where p.polrelid=
  (case entity_type when 'order' then 'public.romiku_orders'::regclass else 'public.romiku_production_orders'::regclass end)
  and p.polcmd='w' and p.polpermissive and pg_get_expr(p.polqual,p.polrelid)='true'
  and pg_get_expr(p.polwithcheck,p.polrelid)='true'
  and (select oid from pg_catalog.pg_roles where rolname='authenticated')=any(p.polroles))
 and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=
  (case entity_type when 'order' then 'public.romiku_orders'::regclass else 'public.romiku_production_orders'::regclass end)
  and p.polcmd in ('w','*') and (not p.polpermissive or coalesce(pg_get_expr(p.polqual,p.polrelid),'true')<>'true'
   or coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'true')<>'true'))
$$;

alter table public.romiku_workbench_requests enable row level security;
alter table public.romiku_workbench_requests force row level security;
alter table public.romiku_workbench_events enable row level security;
alter table public.romiku_workbench_events force row level security;
alter table public.romiku_order_collection_state enable row level security;
alter table public.romiku_order_collection_state force row level security;
alter table public.romiku_production_due_state enable row level security;
alter table public.romiku_production_due_state force row level security;
alter table public.romiku_deposit_evidence enable row level security;
alter table public.romiku_deposit_evidence force row level security;
revoke all on public.romiku_workbench_requests,public.romiku_workbench_events,public.romiku_order_collection_state,public.romiku_production_due_state,public.romiku_deposit_evidence from public,anon,authenticated;
grant select on public.romiku_workbench_requests,public.romiku_workbench_events,public.romiku_order_collection_state,public.romiku_production_due_state,public.romiku_deposit_evidence to authenticated;
grant insert on public.romiku_workbench_requests,public.romiku_workbench_events,public.romiku_deposit_evidence to romiku_workbench_executor;
grant insert,update on public.romiku_order_collection_state,public.romiku_production_due_state to romiku_workbench_executor;
create policy wb_request_read on public.romiku_workbench_requests for select to authenticated using(public.romiku_wb_visible(entity_type,entity_id));
create policy wb_event_read on public.romiku_workbench_events for select to authenticated using(public.romiku_wb_visible(entity_type,entity_id) or (public.romiku_wb_active() and exists(select 1 from public.sales where user_id=auth.uid() and administrator)));
create policy wb_order_read on public.romiku_order_collection_state for select to authenticated using(public.romiku_wb_visible('order',order_id));
create policy wb_due_read on public.romiku_production_due_state for select to authenticated using(public.romiku_wb_visible('production',production_order_id));
create policy wb_evidence_read on public.romiku_deposit_evidence for select to authenticated using(public.romiku_wb_active() and exists(select 1 from public.romiku_workbench_events e where e.id=event_id));
-- Executor alone can mutate. All entry functions check actor and object permissions.
create policy wb_request_insert on public.romiku_workbench_requests for insert to romiku_workbench_executor with check(true);
create policy wb_event_insert on public.romiku_workbench_events for insert to romiku_workbench_executor with check(true);
create policy wb_evidence_insert on public.romiku_deposit_evidence for insert to romiku_workbench_executor with check(true);
create policy wb_order_insert on public.romiku_order_collection_state for insert to romiku_workbench_executor with check(true);
create policy wb_order_update on public.romiku_order_collection_state for update to romiku_workbench_executor using(true) with check(true);
create policy wb_due_insert on public.romiku_production_due_state for insert to romiku_workbench_executor with check(true);
create policy wb_due_update on public.romiku_production_due_state for update to romiku_workbench_executor using(true) with check(true);
revoke all on function public.romiku_wb_active(),public.romiku_wb_visible(text,uuid),public.romiku_wb_manage(text,uuid) from public,anon;
grant execute on function public.romiku_wb_active(),public.romiku_wb_visible(text,uuid),public.romiku_wb_manage(text,uuid) to authenticated;

-- Internal invalidation must also run for trusted system writes with no end-user JWT.
create policy wb_executor_requests_read on public.romiku_workbench_requests for select to romiku_workbench_executor using(true);
create policy wb_executor_events_read on public.romiku_workbench_events for select to romiku_workbench_executor using(true);
create policy wb_executor_order_read on public.romiku_order_collection_state for select to romiku_workbench_executor using(true);
create policy wb_executor_due_read on public.romiku_production_due_state for select to romiku_workbench_executor using(true);
create policy wb_executor_evidence_read on public.romiku_deposit_evidence for select to romiku_workbench_executor using(true);

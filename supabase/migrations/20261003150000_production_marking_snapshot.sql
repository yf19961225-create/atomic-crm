-- Production snapshot and immutable marking assets. Preview rollout only.
alter table public.romiku_formal_customers add column marking_profile jsonb not null default '{}' check (jsonb_typeof(marking_profile)='object');
alter table public.romiku_production_orders add column marking_snapshot jsonb not null default '{}' check (jsonb_typeof(marking_snapshot)='object');
alter table public.romiku_production_items add column position integer not null default 0 check (position >= 0);

-- Release backfill: preserve historical attribution and timestamps. Only the
-- audit trigger is suspended; constraints and other business triggers remain.
-- The lock excludes concurrent writers until the migration transaction ends.
-- Any failure rolls back both this data change and the trigger state.
do $audit_backfill$
begin
  lock table public.romiku_production_items in share row exclusive mode;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.romiku_production_items'::regclass
      and tgname = 'romiku_audit' and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'Expected enabled audit trigger before release backfill';
  end if;
  alter table public.romiku_production_items disable trigger romiku_audit;
with positions as (
 select id,row_number() over(partition by production_order_id order by created_at,id) as position from public.romiku_production_items
) update public.romiku_production_items i set position=p.position from positions p where p.id=i.id;
  alter table public.romiku_production_items enable trigger romiku_audit;
end
$audit_backfill$;

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

alter table public.romiku_formal_customers drop column business_search_fields, drop column business_search_text;
alter table public.romiku_formal_customers
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['name',name,'country',country,'status',status,'notes',notes])||public.romiku_search_snapshot(logistics,'logistics','logistics')||public.romiku_search_snapshot(requirements,'requirements','requirements')||public.romiku_marking_search_fields(marking_profile))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['name',name,'country',country,'status',status,'notes',notes])||public.romiku_search_snapshot(logistics,'logistics','logistics')||public.romiku_search_snapshot(requirements,'requirements','requirements')||public.romiku_marking_search_fields(marking_profile))) stored;
create index romiku_formal_customers_business_search_idx on public.romiku_formal_customers using gin (business_search_text extensions.gin_trgm_ops);

alter table public.romiku_production_orders drop column business_search_fields, drop column business_search_text;
alter table public.romiku_production_orders
  add column business_search_fields jsonb generated always as (public.romiku_search_fields(jsonb_object(array['document_number',document_number,'name',name,'status',status,'anomaly_notes',anomaly_notes,'notes',notes])||jsonb_object(array['factory_due_at',public.romiku_search_date(factory_due_at)])||public.romiku_search_snapshot(supplier_snapshot,'supplier_snapshot','party')||public.romiku_marking_search_fields(marking_snapshot))) stored,
  add column business_search_text text generated always as (public.romiku_search_text(jsonb_object(array['document_number',document_number,'name',name,'status',status,'anomaly_notes',anomaly_notes,'notes',notes])||jsonb_object(array['factory_due_at',public.romiku_search_date(factory_due_at)])||public.romiku_search_snapshot(supplier_snapshot,'supplier_snapshot','party')||public.romiku_marking_search_fields(marking_snapshot))) stored;
create index romiku_production_orders_business_search_idx on public.romiku_production_orders using gin (business_search_text extensions.gin_trgm_ops);

-- Marking images are versioned immutable objects; defaults only remove references.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('romiku-marking-assets','romiku-marking-assets',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy romiku_marking_read on storage.objects for select to authenticated
using (bucket_id='romiku-marking-assets' and auth.uid() is not null);
create policy romiku_marking_insert on storage.objects for insert to authenticated
with check (bucket_id='romiku-marking-assets' and auth.uid() is not null
  and (storage.foldername(name))[1]=auth.uid()::text);
-- No UPDATE / DELETE policy: replacing or removing a reference cannot break history.

revoke all on function public.romiku_marking_search_fields(jsonb) from public,anon;
grant execute on function public.romiku_marking_search_fields(jsonb) to authenticated,service_role;

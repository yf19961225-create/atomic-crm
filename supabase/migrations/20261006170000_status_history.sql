-- All status writes remain on the business tables. Only these triggers write audit rows.
create table public.romiku_status_history (
 id uuid primary key default gen_random_uuid(),
 resource_type text not null check(resource_type in ('quote','pi','order','production','packing','website_inquiry','outbound')),
 resource_id uuid not null,
 from_status text,
 to_status text not null,
 changed_at timestamptz not null default now(),
 changed_by uuid,
 change_source text not null check(change_source in ('create','manual','batch','conversion','system','migration')),
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now()
);
create index romiku_status_history_resource_time_idx on public.romiku_status_history(resource_type,resource_id,changed_at desc,id desc);
alter table public.romiku_status_history enable row level security;
revoke all on public.romiku_status_history from public,anon,authenticated;
grant select on public.romiku_status_history to authenticated;
grant all on public.romiku_status_history to service_role;
create policy read_visible_status_history on public.romiku_status_history for select to authenticated using (
 auth.uid() is not null and exists(select 1 from public.romiku_workflow_records r where r.kind=resource_type and r.id=resource_id)
);
-- Do not attach a cross-resource FK or an auth-user FK that can erase attribution.
alter table public.romiku_quotes add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'quote',id,null,status,status_changed_at,null,'migration' from public.romiku_quotes;
alter table public.romiku_pis add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'pi',id,null,status,status_changed_at,null,'migration' from public.romiku_pis;
alter table public.romiku_orders add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'order',id,null,status,status_changed_at,null,'migration' from public.romiku_orders;
alter table public.romiku_production_orders add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'production',id,null,status,status_changed_at,null,'migration' from public.romiku_production_orders;
alter table public.romiku_packing_lists add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'packing',id,null,status,status_changed_at,null,'migration' from public.romiku_packing_lists;
alter table public.romiku_website_inquiries add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'website_inquiry',id,null,status,status_changed_at,null,'migration' from public.romiku_website_inquiries;
alter table public.romiku_outbound_companies add column status_changed_at timestamptz not null default now();
-- Baseline reflects when tracking began, not an invented historic transition time.
insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 select 'outbound',id,null,status,status_changed_at,null,'migration' from public.romiku_outbound_companies;

create or replace function public.romiku_status_timestamp() returns trigger
language plpgsql security definer set search_path='' as $$
declare caller text := coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
 if tg_table_schema<>'public' or tg_table_name not in ('romiku_quotes','romiku_pis','romiku_orders','romiku_production_orders','romiku_packing_lists','romiku_website_inquiries','romiku_outbound_companies') then
  raise exception 'Unsupported status resource' using errcode='22023';
 end if;
 if caller='anon' or (caller='authenticated' and auth.uid() is null) then raise exception 'Authentication required' using errcode='42501'; end if;
 if tg_op='INSERT' or old.status is distinct from new.status then
  -- Timestamp after acquiring the row lock, never before a concurrent transition.
  new.status_changed_at := case when tg_op='UPDATE' then greatest(clock_timestamp(),old.status_changed_at + interval '1 microsecond') else clock_timestamp() end;
 else new.status_changed_at:=old.status_changed_at;
 end if;
 return new;
end $$;
create or replace function public.romiku_record_status_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; source text; actor uuid:=auth.uid(); caller text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
 if tg_table_schema<>'public' then raise exception 'Unsupported status resource' using errcode='22023'; end if;
 kind:=case tg_table_name when 'romiku_quotes' then 'quote' when 'romiku_pis' then 'pi' when 'romiku_orders' then 'order'
 when 'romiku_production_orders' then 'production' when 'romiku_packing_lists' then 'packing'
 when 'romiku_website_inquiries' then 'website_inquiry' when 'romiku_outbound_companies' then 'outbound' end;
 if kind is null then raise exception 'Unsupported status resource' using errcode='22023'; end if;
 if caller='anon' or (caller='authenticated' and actor is null) then raise exception 'Authentication required' using errcode='42501'; end if;
 if tg_op='DELETE' then
  delete from public.romiku_status_history where resource_type=kind and resource_id=old.id;
  return old;
 end if;
 if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
 source:=case when tg_op='INSERT' then 'create' when actor is null then 'system'
   when current_setting('romiku.status_change_source',true)='batch' then 'batch' else 'manual' end;
 insert into public.romiku_status_history(resource_type,resource_id,from_status,to_status,changed_at,changed_by,change_source)
 values(kind,new.id,case when tg_op='INSERT' then null else old.status end,new.status,new.status_changed_at,actor,source);
 return new;
end $$;
revoke all on function public.romiku_status_timestamp() from public,anon,authenticated;
revoke all on function public.romiku_record_status_history() from public,anon,authenticated;
create trigger zz_status_timestamp before insert or update on public.romiku_quotes for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_quotes for each row execute function public.romiku_record_status_history();
create trigger zz_status_timestamp before insert or update on public.romiku_pis for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_pis for each row execute function public.romiku_record_status_history();
create trigger zz_status_timestamp before insert or update on public.romiku_orders for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_orders for each row execute function public.romiku_record_status_history();
create trigger zz_status_timestamp before insert or update on public.romiku_production_orders for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_production_orders for each row execute function public.romiku_record_status_history();
create trigger zz_status_timestamp before insert or update on public.romiku_packing_lists for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_packing_lists for each row execute function public.romiku_record_status_history();
create trigger zz_status_timestamp before insert or update on public.romiku_website_inquiries for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_website_inquiries for each row execute function public.romiku_record_status_history();
create trigger zz_status_timestamp before insert or update on public.romiku_outbound_companies for each row execute function public.romiku_status_timestamp();
create trigger zz_status_history after insert or update or delete on public.romiku_outbound_companies for each row execute function public.romiku_record_status_history();

-- Parent RLS is enforced by history policy; actor names obey existing sales RLS too.
create or replace view public.romiku_status_history_display with (security_invoker=true) as
 select h.*,nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),'') as changed_by_name
 from public.romiku_status_history h left join public.sales s on s.user_id=h.changed_by;
revoke all on public.romiku_status_history_display from public,anon,authenticated;
grant select on public.romiku_status_history_display to authenticated,service_role;

-- PostgreSQL freezes SELECT * view projections. Append one field while retaining every
-- existing column's name/order and every dependent view. Names here are fixed DDL only.
do $$ declare v record; definition text;
begin
 for v in select * from (values
 ('romiku_quote_totals','romiku_quotes'),('romiku_pi_totals','romiku_pis'),
 ('romiku_order_totals','romiku_orders'),('romiku_packing_totals','romiku_packing_lists'),
 ('romiku_outbound_summary','romiku_outbound_companies')) names(view_name,table_name)
 loop
  definition:=rtrim(pg_get_viewdef(('public.'||v.view_name)::regclass,true), E';\n ');
  execute format('create or replace view public.%I with (security_invoker=true) as select existing.*, header.status_changed_at from (%s) existing join public.%I header on header.id=existing.id',v.view_name,definition,v.table_name);
 end loop;
end $$;

create or replace function public.romiku_batch_status(kind text,ids uuid[],target_status text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid; label text; success jsonb:='[]'; failed jsonb:='[]'; allowed text[]; previous_source text;
begin
if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 条记录。'); end if;
 case kind
 when 'quote' then allowed:=array['pending_quote','quoted','following_up','customer_no_reply','won','invalid'];
 when 'pi' then allowed:=array['draft','sent','confirmed','cancelled'];
 when 'production' then allowed:=array['pending_send','scheduled','received','cancelled'];
 when 'packing' then allowed:=array['draft','incomplete','completed','sent'];
 when 'website_inquiry' then allowed:=array['pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply','won','invalid'];
 when 'outbound' then allowed:=array['to_develop','contacted','no_reply','replied','communicating','purchase_intent','to_quote','quoted','sampling','paused','invalid'];
 else return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','该类型不支持批量修改状态。'); end case;
 if target_status is null or not target_status=any(allowed) then return jsonb_build_object('ok',false,'code','INVALID_STATUS','message','不支持的目标状态。'); end if;
 previous_source:=current_setting('romiku.status_change_source',true);
 perform set_config('romiku.status_change_source','batch',true);
 for v in select distinct unnest(ids) order by 1 loop
  label:=null;
  begin
   select w.label into label from public.romiku_workflow_records w where w.kind=romiku_batch_status.kind and w.id=v;
   case kind
    when 'quote' then update public.romiku_quotes set status=target_status where id=v;
    when 'pi' then update public.romiku_pis set status=target_status where id=v;
    when 'production' then update public.romiku_production_orders set status=target_status where id=v;
    when 'packing' then update public.romiku_packing_lists set status=target_status where id=v;
    when 'website_inquiry' then update public.romiku_website_inquiries set status=target_status where id=v;
    when 'outbound' then update public.romiku_outbound_companies set status=target_status where id=v;
   end case;
   if not found then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'记录不存在'),'code','NOT_FOUND','message','记录不存在或无权操作。'));
   else success:=success||jsonb_build_array(jsonb_build_object('id',v,'label',label)); end if;
  exception when sqlstate 'P4201' then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'生产单'),'code','OVER_ALLOCATED','message',sqlerrm));
  when others then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'记录'),'code','UPDATE_FAILED','message','状态修改失败，记录未被更改。请刷新后重试。')); end;
 end loop;
 perform set_config('romiku.status_change_source',coalesce(previous_source,''),true);
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;
revoke all on function public.romiku_batch_status(text,uuid[],text) from public,anon;
grant execute on function public.romiku_batch_status(text,uuid[],text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- Cursor pagination keeps timestamp ties stable and avoids shifted offset pages after changes.
create or replace function public.romiku_get_status_history(resource_type text,resource_id uuid,page_size integer default 20,before_changed_at timestamptz default null,before_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then raise exception 'Authentication required' using errcode='42501'; end if;
 if resource_type is null or resource_type not in ('quote','pi','order','production','packing','website_inquiry','outbound') or resource_id is null
 or page_size is null or page_size not between 1 and 100 or (before_changed_at is null) <> (before_id is null)
 then raise exception 'Invalid history query' using errcode='22023'; end if;
 with candidates as (
  select h.* from public.romiku_status_history_display h
  where h.resource_type=romiku_get_status_history.resource_type and h.resource_id=romiku_get_status_history.resource_id
  and (before_changed_at is null or (h.changed_at,h.id)<(before_changed_at,before_id))
  order by h.changed_at desc,h.id desc limit page_size+1
 ), page as (select * from candidates order by changed_at desc,id desc limit page_size)
 select jsonb_build_object('records',coalesce((select jsonb_agg(to_jsonb(p) order by p.changed_at desc,p.id desc) from page p),'[]'::jsonb),
  'has_more',(select count(*)>page_size from candidates),
  'next_cursor',(select jsonb_build_object('changed_at',changed_at,'id',id) from page order by changed_at,id limit 1)) into result;
 return result;
end $$;
revoke all on function public.romiku_get_status_history(text,uuid,integer,timestamptz,uuid) from public,anon;
grant execute on function public.romiku_get_status_history(text,uuid,integer,timestamptz,uuid) to authenticated;

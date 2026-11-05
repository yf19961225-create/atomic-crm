create table public.romiku_workbench_refresh (
 order_id uuid primary key,
 revision bigint not null default 1 check(revision > 0)
);
alter table public.romiku_workbench_refresh enable row level security;
alter table public.romiku_workbench_refresh force row level security;
revoke all on public.romiku_workbench_refresh from public,anon,authenticated;
grant select on public.romiku_workbench_refresh to authenticated;
grant select,insert,update on public.romiku_workbench_refresh to romiku_workbench_executor;
create policy wb_refresh_read on public.romiku_workbench_refresh for select to authenticated
 using(public.romiku_wb_visible('order',order_id));
create policy wb_refresh_executor_read on public.romiku_workbench_refresh for select to romiku_workbench_executor using(true);
create policy wb_refresh_executor_insert on public.romiku_workbench_refresh for insert to romiku_workbench_executor with check(true);
create policy wb_refresh_executor_update on public.romiku_workbench_refresh for update to romiku_workbench_executor using(true) with check(true);

create function public.romiku_wb_notify_financial_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; item uuid; oldj jsonb; newj jsonb; keys text[];
begin
 -- Existing business RLS/triggers authorize writes; this trigger only emits a hint.
 if tg_table_schema<>'public' or tg_table_name not in ('romiku_payments','romiku_orders','romiku_order_items') then
  raise exception 'INVALID_REFRESH_SOURCE';
 end if;
 if tg_table_name='romiku_payments' then
  keys:=array['order_id','amount','kind','status','received_at','proof','payment_account','payment_reference','notes'];
 elsif tg_table_name='romiku_orders' then
  keys:=array['freight','discount','other_expenses','currency','deposit_percent','status','archived_at','deposit_due_at','balance_due_at'];
 else
  keys:=array['order_id','quantity','unit_price'];
 end if;
 if tg_op='UPDATE' then
  select jsonb_object_agg(k,to_jsonb(old)->k),jsonb_object_agg(k,to_jsonb(new)->k) into oldj,newj from unnest(keys) k;
  if oldj is not distinct from newj then return new; end if;
 end if;
 if tg_table_name='romiku_orders' then
  if tg_op='DELETE' then return old; end if;
  ids:=array[new.id];
 else
  if tg_op='INSERT' then ids:=array[new.order_id];
  elsif tg_op='DELETE' then ids:=array[old.order_id];
  else ids:=array[old.order_id,new.order_id]; end if;
 end if;
 for item in select distinct u from unnest(ids) u where u is not null order by u loop
  -- Parent-first; NO KEY UPDATE avoids upgrading concurrent receipt FK KEY SHARE locks.
  perform 1 from public.romiku_orders where id=item for no key update;
  if found then
   insert into public.romiku_workbench_refresh as r(order_id,revision) values(item,1)
   on conflict(order_id) do update set revision=r.revision+1;
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.romiku_wb_notify_financial_change() from public,anon,authenticated;
create trigger zz_romiku_wb_refresh_payment after insert or update or delete on public.romiku_payments
 for each row execute function public.romiku_wb_notify_financial_change();
create trigger zz_romiku_wb_refresh_order after insert or update on public.romiku_orders
 for each row execute function public.romiku_wb_notify_financial_change();
create trigger zz_romiku_wb_refresh_item after insert or update or delete on public.romiku_order_items
 for each row execute function public.romiku_wb_notify_financial_change();
alter function public.romiku_wb_notify_financial_change() owner to romiku_workbench_executor;
alter publication supabase_realtime add table public.romiku_workbench_refresh;

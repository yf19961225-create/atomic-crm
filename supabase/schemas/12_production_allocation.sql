-- Allocation reads respect caller RLS; cancelled releases capacity, archived does not.
create or replace function public.romiku_production_allocations(source_order_id uuid)
returns table(id uuid, order_id uuid, sku text, quantity numeric, product_snapshot jsonb, packing_snapshot jsonb,
 ordered_quantity numeric, production_quantity numeric, unallocated_quantity numeric, allocations jsonb)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception '请先登录。' using errcode='42501'; end if;
 return query
 select s.id,s.order_id,s.sku,s.quantity,s.product_snapshot,s.packing_snapshot,s.quantity,
 coalesce(a.quantity,0),s.quantity-coalesce(a.quantity,0),coalesce(a.rows,'[]'::jsonb)
 from public.romiku_order_items s
 left join (
  select d.source_order_item_id,sum(d.quantity) quantity,
   jsonb_agg(jsonb_build_object('id',d.id,'document_number',d.document_number,'quantity',d.quantity,'status',d.status,'archived_at',d.archived_at) order by d.document_number,d.id) rows
  from (
   select i.source_order_item_id,p.id,p.document_number,p.status,p.archived_at,sum(i.quantity) quantity
   from public.romiku_production_items i join public.romiku_production_orders p on p.id=i.production_order_id
   where p.order_id=source_order_id and p.status<>'cancelled'
   group by i.source_order_item_id,p.id
  ) d group by d.source_order_item_id
 ) a on a.source_order_item_id=s.id
 where s.order_id=source_order_id order by s.position,s.id;
end $$;
revoke all on function public.romiku_production_allocations(uuid) from public,anon;
grant execute on function public.romiku_production_allocations(uuid) to authenticated,service_role;

-- Trigger-only enforcement counts all committed allocations, independently of caller RLS.
-- Serialize every allocation writer on its Order. A no-op counter write additionally
-- causes a serialization failure for stale repeatable-read snapshots; numbers are unchanged.
create or replace function public.romiku_lock_production_capacity(parent_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.romiku_orders where id=parent_id for update;
 update public.romiku_production_order_counters set last_value=last_value where order_id=parent_id;
end $$;

create or replace function public.romiku_production_capacity_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent_id uuid; s record; allowed numeric; assigned numeric; prior numeric:=0; proposed numeric; active boolean; body text;
begin
 -- Reparenting a Production or its saved line is outside this model's edit contract.
 if tg_op='UPDATE' and new.order_id is distinct from old.order_id then
  raise exception '生产安排不能更换所属订单。' using errcode='23514';
 end if;
 parent_id:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 perform public.romiku_lock_production_capacity(parent_id);
 if tg_op='DELETE' then return old; end if;
 if tg_table_name='romiku_production_orders' then
  if tg_op='UPDATE' and old.status='cancelled' and new.status<>'cancelled' then
   for s in select i.source_order_item_id,sum(i.quantity) quantity,min(i.sku) sku from public.romiku_production_items i where i.production_order_id=new.id group by i.source_order_item_id loop
    select quantity into allowed from public.romiku_order_items where id=s.source_order_item_id;
    select coalesce(sum(i.quantity),0) into assigned from public.romiku_production_items i join public.romiku_production_orders p on p.id=i.production_order_id where i.source_order_item_id=s.source_order_item_id and p.id<>new.id and p.status<>'cancelled';
    if assigned+s.quantity>allowed then
     body:=format('%s 的生产安排超过订单数量。订单数量：%s；其他生产单已安排：%s；本生产单：%s；保存后累计：%s；超出：%s。请调整数量后重试。',s.sku,allowed,assigned,s.quantity,assigned+s.quantity,assigned+s.quantity-allowed);
     raise exception using errcode='P4201',message=body;
    end if;
   end loop;
  end if;
 elsif tg_table_name='romiku_production_items' then
  select p.status<>'cancelled' into active from public.romiku_production_orders p where p.id=new.production_order_id;
  if not coalesce(active,false) then return new; end if;
  if tg_op='UPDATE' and old.production_order_id=new.production_order_id and old.source_order_item_id=new.source_order_item_id then
   prior:=old.quantity;
  end if;
  -- Legacy excess can be reduced or have its instructions edited, never increased.
  if tg_op='UPDATE' and new.quantity<=prior then return new; end if;
  select quantity into allowed from public.romiku_order_items where id=new.source_order_item_id and order_id=new.order_id;
  select coalesce(sum(i.quantity),0) into assigned from public.romiku_production_items i join public.romiku_production_orders p on p.id=i.production_order_id where i.source_order_item_id=new.source_order_item_id and p.status<>'cancelled' and (tg_op='INSERT' or i.id<>new.id);
  if assigned+new.quantity>allowed then
   select coalesce(sum(i.quantity),0)+new.quantity into proposed from public.romiku_production_items i where i.production_order_id=new.production_order_id and i.source_order_item_id=new.source_order_item_id and (tg_op='INSERT' or i.id<>new.id);
   body:=format('%s 的生产安排超过订单数量。订单数量：%s；其他生产单已安排：%s；本生产单：%s；保存后累计：%s；超出：%s。请调整数量后重试。',new.sku,allowed,assigned+new.quantity-proposed,proposed,assigned+new.quantity,assigned+new.quantity-allowed);
   raise exception using errcode='P4201',message=body;
  end if;
 end if;
 return new;
end $$;

create or replace function public.romiku_order_production_capacity_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare assigned numeric;
begin
 if new.quantity>=old.quantity then return new; end if;
 perform public.romiku_lock_production_capacity(new.order_id);
 select coalesce(sum(i.quantity),0) into assigned from public.romiku_production_items i join public.romiku_production_orders p on p.id=i.production_order_id where i.source_order_item_id=new.id and p.status<>'cancelled';
 if new.quantity<assigned then raise exception '订单数量不能小于已安排生产数量 %。请先调整生产安排。',assigned using errcode='23514'; end if;
 return new;
end $$;
revoke all on function public.romiku_lock_production_capacity(uuid),public.romiku_production_capacity_guard(),public.romiku_order_production_capacity_guard() from public,anon,authenticated;
-- Header lock precedes the numbering trigger, avoiding lock inversion on creation.
create trigger romiku_a_capacity_lock before insert or update or delete on public.romiku_production_orders for each row execute function public.romiku_production_capacity_guard();
create trigger romiku_production_item_capacity before insert or update or delete on public.romiku_production_items for each row execute function public.romiku_production_capacity_guard();
create trigger romiku_order_production_capacity before update of quantity on public.romiku_order_items for each row execute function public.romiku_order_production_capacity_guard();

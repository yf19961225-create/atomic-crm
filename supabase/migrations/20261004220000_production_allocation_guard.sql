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

-- Existing business model; invoker RPCs add atomic edit sessions only.
create or replace function public.romiku_save_production_workspace(
 production_id uuid, source_order_id uuid, header jsonb, items jsonb, expected jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 o public.romiku_orders%rowtype; p public.romiku_production_orders%rowtype;
 s public.romiku_order_items%rowtype; line public.romiku_production_items%rowtype;
 patch jsonb; key text; saved jsonb; target uuid; n integer; wanted integer;
 message text := '保存失败，整张生产单未写入，请刷新后重试。'; code text := 'SAVE_FAILED';
 total numeric; qty numeric; pack jsonb; capacity record; issues jsonb := '[]'; previous_qty numeric; other_qty numeric; occupying jsonb; next_status text;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if jsonb_typeof(header) is distinct from 'object' or jsonb_typeof(items) is distinct from 'array' or jsonb_typeof(expected) is distinct from 'object' then raise exception 'invalid'; end if;
 if jsonb_array_length(items)=0 or jsonb_array_length(items)>1000 then message:='请保留至少一个产品，单次最多保存 1000 项。'; raise exception 'invalid'; end if;
 for key in select jsonb_object_keys(header) loop
  if key not in ('document_number','name','status','factory_due_at','anomaly_notes','notes','marking_snapshot') then raise exception 'invalid'; end if;
 end loop;
 select * into o from public.romiku_orders where id=source_order_id for update;
 if not found then message:='无法读取所属订单，请刷新后重试。'; code:='NOT_FOUND'; raise exception 'invalid'; end if;
 if production_id is not null then
  select * into p from public.romiku_production_orders where id=production_id and order_id=source_order_id for update;
  if not found then message:='生产单不存在或所属订单不匹配。'; code:='NOT_FOUND'; raise exception 'invalid'; end if;
  perform 1 from public.romiku_production_items where production_order_id=production_id order by id for update;
  if (expected->>'header_updated_at')::timestamptz is distinct from p.updated_at
   or jsonb_typeof(expected->'items') is distinct from 'array'
   or (select count(*) from public.romiku_production_items where production_order_id=production_id) <> jsonb_array_length(expected->'items')
   or exists(select 1 from public.romiku_production_items i where i.production_order_id=production_id and not exists(
    select 1 from jsonb_array_elements(expected->'items') e where (e->>'id')::uuid=i.id and (e->>'updated_at')::timestamptz=i.updated_at)) then
   message:='生产单已被其他操作更新，请刷新后重新编辑。'; code:='STALE'; raise exception 'invalid';
  end if;
  target:=p.id;
 else
  if (expected->>'order_updated_at')::timestamptz is distinct from o.updated_at then
   message:='订单默认值已变化，请返回产品选择步骤重新载入。'; code:='STALE'; raise exception 'invalid';
  end if;
  saved:=o.production_defaults_snapshot || jsonb_build_object('source',jsonb_build_object('kind','order','id',o.id,'copied_at',now()),'initialized_at',now());
  insert into public.romiku_production_orders(order_id,status,marking_snapshot) values(o.id,'pending',saved) returning * into p;
  target:=p.id;
 end if;
 saved:=coalesce(header->'marking_snapshot',p.marking_snapshot);
 if jsonb_typeof(saved) is distinct from 'object'
  or not public.romiku_valid_instruction_labels(jsonb_build_array(coalesce(saved->'front_mark','{"mode":"none"}'),coalesce(saved->'side_mark','{"mode":"none"}'),coalesce(saved->'small_label','{"mode":"none"}')))
  or not public.romiku_valid_instruction_labels(coalesce(saved->'additional_labels','[]')) then message:='统一生产要求格式无效，请检查图片与标签。'; raise exception 'invalid'; end if;
 for key in select unnest(array['labeling_requirements','production_requirements','notes']) loop
  if saved ? key and jsonb_typeof(saved->key)<>'string' then raise exception 'invalid'; end if;
 end loop;
 -- Source provenance cannot be forged by a client edit.
 saved:=saved || jsonb_build_object('schema_version',2,'initialized_at',coalesce(nullif(p.marking_snapshot->>'initialized_at',''),now()::text),'source',coalesce(p.marking_snapshot->'source',jsonb_build_object('kind','manual','id',target)));
 if header ? 'status' and header->>'status' not in ('pending','in_production','completed','received','cancelled') then raise exception 'invalid'; end if;
 next_status:=coalesce(header->>'status',p.status);
 if next_status<>'cancelled' then
  for capacity in select src.id,src.sku,src.quantity ordered,sum((x->>'quantity')::numeric) proposed
   from jsonb_array_elements(items) x join public.romiku_order_items src on src.id=(x->>'source_order_item_id')::uuid and src.order_id=o.id group by src.id loop
   select coalesce(sum(quantity),0) into previous_qty from public.romiku_production_items where production_order_id=target and source_order_item_id=capacity.id;
   select coalesce(sum(i.quantity),0) into other_qty from public.romiku_production_items i join public.romiku_production_orders x on x.id=i.production_order_id where i.source_order_item_id=capacity.id and x.id<>target and x.status<>'cancelled';
   if other_qty+capacity.proposed>capacity.ordered and (p.status='cancelled' or capacity.proposed>previous_qty) then
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'document_number',a.document_number,'quantity',a.quantity) order by a.document_number,a.id),'[]') into occupying from (
     select x.id,x.document_number,sum(i.quantity) quantity from public.romiku_production_items i join public.romiku_production_orders x on x.id=i.production_order_id where i.source_order_item_id=capacity.id and x.id<>target and x.status<>'cancelled' group by x.id
    ) a;
    issues:=issues || jsonb_build_array(jsonb_build_object('source_order_item_id',capacity.id,'sku',capacity.sku,'ordered_quantity',capacity.ordered,'other_quantity',other_qty,'this_quantity',capacity.proposed,'total_quantity',other_qty+capacity.proposed,'excess_quantity',other_qty+capacity.proposed-capacity.ordered,'allocations',occupying));
   end if;
  end loop;
 end if;
 if jsonb_array_length(issues)>0 then
  message:='生产安排超过订单数量，请调整本次数量后保存。';code:='OVER_ASSIGNED';raise exception 'invalid';
 end if;
 update public.romiku_production_orders set
 document_number=case when production_id is not null and header ? 'document_number' then header->>'document_number' else p.document_number end,
 name=case when header ? 'name' then header->>'name' else p.name end,
 status=case when next_status='cancelled' then 'cancelled' else p.status end,
 factory_due_at=case when header ? 'factory_due_at' then nullif(header->>'factory_due_at','')::timestamptz else p.factory_due_at end,
 anomaly_notes=case when header ? 'anomaly_notes' then header->>'anomaly_notes' else p.anomaly_notes end,
 notes=case when header ? 'notes' then header->>'notes' else p.notes end,
 marking_snapshot=saved where id=target;
 if not found then raise exception 'denied'; end if;
 -- Every existing line must be present once. No implicit row deletion.
 if exists(select 1 from public.romiku_production_items i where i.production_order_id=target and not exists(select 1 from jsonb_array_elements(items) x where nullif(x->>'id','')::uuid=i.id))
 or (select count(*) from jsonb_array_elements(items) x where nullif(x->>'id','') is not null) <> (select count(distinct x->>'id') from jsonb_array_elements(items) x where nullif(x->>'id','') is not null) then
 message:='产品列表已变化，请刷新后重新编辑。'; code:='STALE'; raise exception 'invalid'; end if;
 for patch in select x.value from jsonb_array_elements(items) x order by (x.value->>'quantity')::numeric-coalesce((select i.quantity from public.romiku_production_items i where i.id=nullif(x.value->>'id','')::uuid),0) loop
  if jsonb_typeof(patch)<>'object' then raise exception 'invalid'; end if;
  for key in select jsonb_object_keys(patch) loop
   if key not in ('id','source_order_item_id','quantity','product_snapshot','packaging_snapshot','production_note_zh','marking_override') then raise exception 'invalid'; end if;
  end loop;
  select * into s from public.romiku_order_items where id=(patch->>'source_order_item_id')::uuid and order_id=o.id for share;
  if not found then message:='所有产品必须来自所属订单。'; raise exception 'invalid'; end if;
  if nullif(patch->>'id','') is not null then
   select * into line from public.romiku_production_items where id=(patch->>'id')::uuid and production_order_id=target and source_order_item_id=s.id;
   if not found then message:='产品不属于此生产单或来源已变化。'; raise exception 'invalid'; end if;
  else
   line:=null;
   line.product_snapshot:=s.product_snapshot; line.packaging_snapshot:=s.packing_snapshot;
   line.marking_override:='{"mode":"inherit"}';
  end if;
  qty:=(patch->>'quantity')::numeric;
  if qty is null or qty<=0 or qty::text in ('NaN','Infinity','-Infinity') then message:='生产数量必须大于零。'; raise exception 'invalid'; end if;
  if jsonb_typeof(patch->'product_snapshot') is distinct from 'object' or jsonb_typeof(patch->'packaging_snapshot') is distinct from 'object' then raise exception 'invalid'; end if;
  for key in select jsonb_object_keys(patch->'product_snapshot') loop
   if key not in ('name','specification','image_url') or jsonb_typeof(patch#>array['product_snapshot',key]) not in ('string','null') then raise exception 'invalid'; end if;
  end loop;
  for key in select jsonb_object_keys(patch->'packaging_snapshot') loop
   if key not in ('cartons','qty_per_carton') then raise exception 'invalid'; end if;
   if nullif(patch#>>array['packaging_snapshot',key],'') is not null and ((patch#>>array['packaging_snapshot',key])::numeric<0 or (patch#>>array['packaging_snapshot',key])::numeric::text in ('NaN','Infinity','-Infinity')) then message:='箱数和装箱数必须为非负数。'; raise exception 'invalid'; end if;
  end loop;
  if not public.romiku_valid_item_marking(coalesce(patch->'marking_override',line.marking_override)) then message:='产品特殊要求格式无效。'; raise exception 'invalid'; end if;
  pack:=coalesce(line.packaging_snapshot,'{}') || (patch->'packaging_snapshot');
  if line.id is null then
   insert into public.romiku_production_items(production_order_id,order_id,source_order_item_id,sku,sanity_product_id,position,quantity,product_snapshot,packaging_snapshot,production_note_zh,marking_override)
   values(target,o.id,s.id,s.sku,s.sanity_product_id,(select coalesce(max(position),0)+1 from public.romiku_production_items where production_order_id=target),qty,line.product_snapshot || (patch->'product_snapshot'),pack,patch->>'production_note_zh',coalesce(patch->'marking_override','{"mode":"inherit"}'));
  else
   update public.romiku_production_items set quantity=qty,product_snapshot=line.product_snapshot || (patch->'product_snapshot'),packaging_snapshot=pack,
    production_note_zh=case when patch ? 'production_note_zh' then patch->>'production_note_zh' else line.production_note_zh end,
    marking_override=coalesce(patch->'marking_override',line.marking_override) where id=line.id;
   if not found then raise exception 'denied'; end if;
  end if;
 end loop;
 -- Apply cancelled → active only after all item quantities have their final values.
 update public.romiku_production_orders set status=next_status where id=target and status is distinct from next_status;
 return jsonb_build_object('ok',true,'id',target);
exception
 when sqlstate 'P4201' then return jsonb_build_object('ok',false,'code','OVER_ASSIGNED','message',sqlerrm,'dependencies',issues);
 when others then return jsonb_build_object('ok',false,'code',code,'message',message,'dependencies',issues);
end
$$;

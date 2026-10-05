-- EAN-13 numbers are snapshot text, not GS1-issued identifiers.
create or replace function public.romiku_valid_ean13(value text)
returns boolean language sql immutable parallel safe set search_path='' as $$
 select value is null or (value ~ '^[0-9]{13}$' and
 (select sum((substr(value,n,1))::integer * case when n%2=0 then 3 else 1 end)%10=0 from generate_series(1,13) n where value ~ '^[0-9]{13}$'))
$$;
revoke all on function public.romiku_valid_ean13(text) from public,anon;
grant execute on function public.romiku_valid_ean13(text) to authenticated,service_role;
alter table public.romiku_production_items add column barcode_number text null;
alter table public.romiku_production_items add constraint romiku_production_items_barcode_check check (public.romiku_valid_ean13(barcode_number));
create index romiku_production_items_barcode_idx on public.romiku_production_items(barcode_number) where barcode_number is not null;
-- SKU is the existing unique Product Library identity. Repeated snapshots may reuse it.
-- A reservation is retained after a cancelled edit; it never silently assigns an item.
create table public.romiku_production_barcodes (
 barcode_number text primary key check (barcode_number is not null and public.romiku_valid_ean13(barcode_number)),
 sku text not null check (sku=btrim(sku) and sku<>''),
 source text not null check(source in ('manual','generated')),
 source_order_item_id uuid references public.romiku_order_items(id) on delete set null,
 created_at timestamptz not null default now()
);
create index romiku_production_barcodes_source_idx on public.romiku_production_barcodes(source_order_item_id);
alter table public.romiku_production_barcodes enable row level security;
revoke all on public.romiku_production_barcodes from public,anon,authenticated;
grant select,insert on public.romiku_production_barcodes to authenticated;
grant all on public.romiku_production_barcodes to service_role;
create policy barcode_read on public.romiku_production_barcodes for select to authenticated using(auth.uid() is not null);
create policy barcode_reserve on public.romiku_production_barcodes for insert to authenticated with check(auth.uid() is not null);
create or replace function public.romiku_production_item_barcode_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.barcode_number:=nullif(btrim(new.barcode_number,E' \t\n\r'),'');
 if new.barcode_number is null then return new; end if;
 if not public.romiku_valid_ean13(new.barcode_number) then raise exception using errcode='P4202',message='EAN-13 必须是 13 位数字且校验位正确。'; end if;
 insert into public.romiku_production_barcodes(barcode_number,sku,source,source_order_item_id)
 values(new.barcode_number,btrim(new.sku),'manual',new.source_order_item_id) on conflict(barcode_number) do nothing;
 if not exists(select 1 from public.romiku_production_barcodes where barcode_number=new.barcode_number and sku=btrim(new.sku)) then
 raise exception using errcode='P4203',message='该条形码已用于其他 SKU，请核对号码。'; end if;
 return new;
end $$;
revoke all on function public.romiku_production_item_barcode_guard() from public,anon;
create trigger romiku_production_item_barcode_guard before insert or update of barcode_number,sku on public.romiku_production_items for each row execute function public.romiku_production_item_barcode_guard();
create or replace function public.romiku_production_barcode(source_item_id uuid, generate_number boolean default false, production_item_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.romiku_order_items%rowtype; saved_item public.romiku_production_items%rowtype; candidates jsonb; body text; candidate text; n integer; total integer; inserted integer;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','请先登录。'); end if;
 select * into s from public.romiku_order_items where id=source_item_id;
 if not found then return jsonb_build_object('ok',false,'message','无法读取所属订单产品。'); end if;
 -- Same order serialization also covers workspace saves and split-production reuse.
 perform 1 from public.romiku_orders where id=s.order_id for update;
 if not found then return jsonb_build_object('ok',false,'message','无法读取所属订单。'); end if;
 if production_item_id is not null then
  select * into saved_item from public.romiku_production_items where id=production_item_id and source_order_item_id=s.id and order_id=s.order_id;
  if not found then return jsonb_build_object('ok',false,'message','无法读取已保存的生产产品。'); end if;
  s.sku:=saved_item.sku;
 end if;
 select coalesce(jsonb_agg(v.barcode_number order by v.barcode_number),'[]') into candidates from (
 select i.barcode_number from public.romiku_production_items i where i.order_id=s.order_id and btrim(i.sku)=btrim(s.sku) and i.barcode_number is not null
 union
 select b.barcode_number from public.romiku_production_barcodes b join public.romiku_order_items oi on oi.id=b.source_order_item_id where oi.order_id=s.order_id and b.sku=btrim(s.sku)
 ) v;
 if jsonb_array_length(candidates)>0 then return jsonb_build_object('ok',true,'kind','reuse','candidates',candidates); end if;
 if not generate_number then return jsonb_build_object('ok',true,'kind','empty','candidates','[]'::jsonb); end if;
 for attempt in 1..20 loop
  body:='';total:=0;
  for n in 1..12 loop
   candidate:=floor(random()*10)::integer::text;body:=body||candidate;total:=total+candidate::integer*case when n%2=0 then 3 else 1 end;
  end loop;
  candidate:=body||((10-total%10)%10)::text;
  -- Primary key claims the number atomically across every CRM item and session.
  insert into public.romiku_production_barcodes(barcode_number,sku,source,source_order_item_id) values(candidate,btrim(s.sku),'generated',s.id) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 then return jsonb_build_object('ok',true,'kind','generated','candidates',jsonb_build_array(candidate)); end if;
 end loop;
 return jsonb_build_object('ok',false,'message','暂时无法生成未使用号码，请重试。');
exception when others then return jsonb_build_object('ok',false,'message','条形码读取或生成失败，请刷新后重试。');
end $$;
revoke all on function public.romiku_production_barcode(uuid,boolean,uuid) from public,anon;
grant execute on function public.romiku_production_barcode(uuid,boolean,uuid) to authenticated,service_role;

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
   if key not in ('id','source_order_item_id','quantity','product_snapshot','packaging_snapshot','production_note_zh','marking_override','barcode_number') then raise exception 'invalid'; end if;
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
  if patch ? 'barcode_number' then
   if jsonb_typeof(patch->'barcode_number') not in ('string','null') then message:='EAN-13 必须以文本保存。';code:='INVALID_BARCODE';raise exception 'invalid';end if;
   line.barcode_number:=nullif(btrim(patch->>'barcode_number',E' \t\n\r'),'');
   if not public.romiku_valid_ean13(line.barcode_number) then message:='EAN-13 必须是 13 位数字且校验位正确。';code:='INVALID_BARCODE';raise exception 'invalid';end if;
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
   insert into public.romiku_production_items(production_order_id,order_id,source_order_item_id,sku,sanity_product_id,position,quantity,product_snapshot,packaging_snapshot,production_note_zh,marking_override,barcode_number)
   values(target,o.id,s.id,s.sku,s.sanity_product_id,(select coalesce(max(position),0)+1 from public.romiku_production_items where production_order_id=target),qty,line.product_snapshot || (patch->'product_snapshot'),pack,patch->>'production_note_zh',coalesce(patch->'marking_override','{"mode":"inherit"}'),line.barcode_number);
  else
   update public.romiku_production_items set barcode_number=line.barcode_number,quantity=qty,product_snapshot=line.product_snapshot || (patch->'product_snapshot'),packaging_snapshot=pack,
    production_note_zh=case when patch ? 'production_note_zh' then patch->>'production_note_zh' else line.production_note_zh end,
    marking_override=coalesce(patch->'marking_override',line.marking_override) where id=line.id;
   if not found then raise exception 'denied'; end if;
  end if;
 end loop;
 -- Apply cancelled → active only after all item quantities have their final values.
 update public.romiku_production_orders set status=next_status where id=target and status is distinct from next_status;
 return jsonb_build_object('ok',true,'id',target);
exception
 when sqlstate 'P4202' then return jsonb_build_object('ok',false,'code','INVALID_BARCODE','message',sqlerrm);
 when sqlstate 'P4203' then return jsonb_build_object('ok',false,'code','BARCODE_CONFLICT','message',sqlerrm);
 when sqlstate 'P4201' then return jsonb_build_object('ok',false,'code','OVER_ASSIGNED','message',sqlerrm,'dependencies',issues);
 when others then return jsonb_build_object('ok',false,'code',code,'message',message,'dependencies',issues);
end
$$;

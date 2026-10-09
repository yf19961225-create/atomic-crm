-- Explicitly audited Preview mapping. Abort rather than guess other historical meanings.
do $$ begin
 if exists(select 1 from public.romiku_quotes where status not in ('draft','pending_quote','sent','won'))
 or exists(select 1 from public.romiku_production_orders where status not in ('pending','in_production','pending_send','scheduled','received','cancelled'))
 or exists(select 1 from public.romiku_website_inquiries where status not in ('new','pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply','won','invalid')) then
 raise exception 'Unmapped historical status: migration requires a fresh audit'; end if;
end $$;

-- Release backfill: preserve historical attribution and timestamps. Only the
-- audit trigger is suspended; constraints and other business triggers remain.
-- The lock excludes concurrent writers until the migration transaction ends.
-- Any failure rolls back both this data change and the trigger state.
do $audit_backfill$
begin
  lock table public.romiku_quotes in share row exclusive mode;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.romiku_quotes'::regclass
      and tgname = 'romiku_audit' and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'Expected enabled audit trigger before release backfill';
  end if;
  alter table public.romiku_quotes disable trigger romiku_audit;
update public.romiku_quotes set status='pending_quote' where status='draft';
  alter table public.romiku_quotes enable trigger romiku_audit;
end
$audit_backfill$;

-- Release backfill: preserve historical attribution and timestamps. Only the
-- audit trigger is suspended; constraints and other business triggers remain.
-- The lock excludes concurrent writers until the migration transaction ends.
-- Any failure rolls back both this data change and the trigger state.
do $audit_backfill$
begin
  lock table public.romiku_production_orders in share row exclusive mode;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.romiku_production_orders'::regclass
      and tgname = 'romiku_audit' and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'Expected enabled audit trigger before release backfill';
  end if;
  alter table public.romiku_production_orders disable trigger romiku_audit;
update public.romiku_production_orders set status=case status when 'pending' then 'pending_send' when 'in_production' then 'scheduled' end where status in ('pending','in_production');
  alter table public.romiku_production_orders enable trigger romiku_audit;
end
$audit_backfill$;
alter table public.romiku_website_inquiries drop constraint romiku_website_inquiries_status_check;

-- Release backfill: preserve historical attribution and timestamps. Only the
-- audit trigger is suspended; constraints and other business triggers remain.
-- The lock excludes concurrent writers until the migration transaction ends.
-- Any failure rolls back both this data change and the trigger state.
do $audit_backfill$
begin
  lock table public.romiku_website_inquiries in share row exclusive mode;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.romiku_website_inquiries'::regclass
      and tgname = 'romiku_audit' and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'Expected enabled audit trigger before release backfill';
  end if;
  alter table public.romiku_website_inquiries disable trigger romiku_audit;
update public.romiku_website_inquiries set status='pending_screening' where status='new';
  alter table public.romiku_website_inquiries enable trigger romiku_audit;
end
$audit_backfill$;
alter table public.romiku_quotes alter column status set default 'pending_quote', add constraint romiku_quotes_status_check check(status in ('pending_quote','sent','won'));
alter table public.romiku_pis add constraint romiku_pis_status_check check(status in ('draft','sent','confirmed','cancelled'));
alter table public.romiku_production_orders alter column status set default 'pending_send', add constraint romiku_production_orders_status_check check(status in ('pending_send','scheduled','received','cancelled'));
alter table public.romiku_website_inquiries alter column status set default 'pending_screening', add constraint romiku_website_inquiries_status_check check(status in ('pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply','won','invalid'));
alter table public.romiku_packing_lists add column status text not null default 'draft' check(status in ('draft','incomplete','completed','sent'));
create index romiku_packing_lists_status_idx on public.romiku_packing_lists(status);
-- Only unambiguous input aliases are accepted from stale clients; final values are stored.
create or replace function public.romiku_normalize_workflow_status() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_table_name='romiku_quotes' and new.status='draft' then new.status:='pending_quote';
 elsif tg_table_name='romiku_production_orders' and new.status='pending' then new.status:='pending_send';
 elsif tg_table_name='romiku_production_orders' and new.status='in_production' then new.status:='scheduled';
 elsif tg_table_name='romiku_website_inquiries' and new.status='new' then new.status:='pending_screening'; end if;
 return new; end $$;
create trigger aa_normalize_workflow_status before insert or update of status on public.romiku_quotes for each row execute function public.romiku_normalize_workflow_status();
create trigger aa_normalize_workflow_status before insert or update of status on public.romiku_production_orders for each row execute function public.romiku_normalize_workflow_status();
create trigger aa_normalize_workflow_status before insert or update of status on public.romiku_website_inquiries for each row execute function public.romiku_normalize_workflow_status();

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
  insert into public.romiku_production_orders(order_id,status,marking_snapshot) values(o.id,'pending_send',saved) returning * into p;
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
 if header ? 'status' and header->>'status' not in ('pending_send','scheduled','received','cancelled') then raise exception 'invalid'; end if;
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
create or replace function public.romiku_has_production_instructions(value jsonb)
returns boolean language sql immutable parallel safe set search_path='' as $$
 select coalesce(
  exists (select 1 from jsonb_array_elements(
   jsonb_build_array(value->'front_mark',value->'side_mark',value->'small_label') ||
   case when jsonb_typeof(value->'additional_labels')='array' then value->'additional_labels' else '[]'::jsonb end
  ) m where
   (coalesce(m->>'mode',case when m#>>'{image_asset,path}' is not null then 'image' else 'text' end)='text'
    and jsonb_typeof(m->'text')='string' and btrim(m->>'text',E' \t\n\r')<>'')
   or (coalesce(m->>'mode','image')='image' and m#>>'{image_asset,bucket}'='romiku-marking-assets'
    and m#>>'{image_asset,path}' ~ '^[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$'
    and position('..' in m#>>'{image_asset,path}')=0)
  ) or exists (select 1 from unnest(array['labeling_requirements','production_requirements','notes']) k
    where jsonb_typeof(value->k)='string' and btrim(value->>k,E' \t\n\r')<>''),false)
$$;
create or replace function public.romiku_sync_order_production_defaults(source_order_id uuid, expected jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.romiku_orders%rowtype; rows jsonb; token text; n integer; saved jsonb; verified integer;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','请先登录。'); end if;
 select * into o from public.romiku_orders where id=source_order_id for update;
 if not found then return jsonb_build_object('ok',false,'message','无法读取所属订单。'); end if;
 if not public.romiku_has_production_instructions(o.production_defaults_snapshot) then
  return jsonb_build_object('ok',false,'code','EMPTY_DEFAULTS','message','当前订单尚未设置统一生产要求，请先设置订单的生产要求 / 唛头与标签。');
 end if;
 perform 1 from public.romiku_production_orders where order_id=o.id and archived_at is null and status in ('pending_send','scheduled') order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'document_number',document_number,'updated_at',updated_at) order by document_number,id),'[]') into rows from public.romiku_production_orders where order_id=o.id and archived_at is null and status in ('pending_send','scheduled');
 token:=md5(o.production_defaults_snapshot::text || rows::text);
 if expected is null then return jsonb_build_object('ok',true,'token',token,'productions',rows,'source_snapshot',o.production_defaults_snapshot,'order_document_number',o.document_number); end if;
 if expected->>'token' is distinct from token then return jsonb_build_object('ok',false,'message','订单要求或生产单已变化，请重新预览后确认。'); end if;
 if jsonb_array_length(rows)=0 then return jsonb_build_object('ok',false,'message','没有可同步的未完成生产单。'); end if;
 saved:=o.production_defaults_snapshot || jsonb_build_object('source',jsonb_build_object('kind','order','id',o.id,'copied_at',now()),'initialized_at',now());
 update public.romiku_production_orders set marking_snapshot=saved
 where order_id=o.id and archived_at is null and status in ('pending_send','scheduled')
 and id in (select (value->>'id')::uuid from jsonb_array_elements(rows));
 get diagnostics n=row_count;
 if n<>jsonb_array_length(rows) then raise exception 'denied'; end if;
 -- Re-read stored content after all row/statement triggers, inside this same transaction.
 select count(*) into verified from public.romiku_production_orders
 where id in (select (value->>'id')::uuid from jsonb_array_elements(rows)) and marking_snapshot=saved;
 if verified<>n then raise exception 'verification failed'; end if;
 return jsonb_build_object('ok',true,'count',n,'productions',rows,'source_snapshot',o.production_defaults_snapshot,'order_document_number',o.document_number);
exception when others then return jsonb_build_object('ok',false,'message','同步未完成，所有生产单保持原值，请刷新后重试。');
end
$$;
create or replace function public.romiku_valid_ean13(value text)
returns boolean language sql immutable parallel safe set search_path='' as $$
 select value is null or (value ~ '^[0-9]{13}$' and
 (select sum((substr(value,n,1))::integer * case when n%2=0 then 3 else 1 end)%10=0 from generate_series(1,13) n where value ~ '^[0-9]{13}$'))
$$;
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
create or replace function public.romiku_order_delete_eligibility(order_uuid uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.romiku_orders; p record; productions jsonb:='[]'; reasons jsonb:='[]'; pc int; payments int; packings int; label text;
begin
 select * into o from public.romiku_orders where id=order_uuid;
 if not found then return jsonb_build_object('order_id',order_uuid,'document_number','订单不存在','production_count',0,'packing_count',0,'payment_count',0,'delete_mode','blocked','cascade_productions','[]'::jsonb,'blocked_reasons',jsonb_build_array('订单不存在。'),'code','NOT_FOUND'); end if;
 select count(*) into packings from public.romiku_packing_lists where order_id=order_uuid;
 select count(*) into payments from public.romiku_payments where order_id=order_uuid;
 if packings>0 then reasons:=reasons||jsonb_build_array(format('已有 %s 张装箱单，无法删除。',packings)); end if;
 if payments>0 then reasons:=reasons||jsonb_build_array('该订单存在收款历史，不能永久删除。可以作废订单。'); end if;
 for p in select po.*, (select count(*) from public.romiku_production_followups f where f.production_order_id=po.id) followups from public.romiku_production_orders po where po.order_id=order_uuid order by po.document_number,po.id loop
  label:=case p.status when 'pending_send' then '待发送' when 'cancelled' then '已取消' when 'scheduled' then '已排产' when 'completed' then '已完成' when 'received' then '已收货' else '非允许删除状态' end;
  productions:=productions||jsonb_build_array(jsonb_build_object('id',p.id,'document_number',p.document_number,'status',p.status,'status_label',label,'followup_count',p.followups,'archived',p.archived_at is not null));
  if p.archived_at is not null then reasons:=reasons||jsonb_build_array(format('%s 已归档，无法删除。',p.document_number)); end if;
  if p.status not in ('pending_send','cancelled') then reasons:=reasons||jsonb_build_array(format('%s 已处于%s，无法删除。',p.document_number,label)); end if;
  if p.followups>0 then reasons:=reasons||jsonb_build_array(format('%s 已有 %s 条生产跟进记录，无法删除。',p.document_number,p.followups)); end if;
 end loop;
 pc:=jsonb_array_length(productions);
 return jsonb_build_object('order_id',o.id,'document_number',o.document_number,'production_count',pc,'packing_count',packings,'payment_count',payments,'delete_mode',case when jsonb_array_length(reasons)>0 then 'blocked' when pc>0 then 'cascade_production' else 'order_only' end,'cascade_productions',productions,'blocked_reasons',reasons,'code',case when jsonb_array_length(reasons)>0 then 'HAS_DOWNSTREAM' else null end);
end $$;
create or replace function public.romiku_order_delete_preflight(ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; row_data jsonb; deletable jsonb:='[]'; blocked jsonb:='[]';
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 张订单。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  row_data:=public.romiku_order_delete_eligibility(v);
  if row_data->>'delete_mode'='blocked' then blocked:=blocked||jsonb_build_array(row_data); else deletable:=deletable||jsonb_build_array(row_data); end if;
 end loop;
 return jsonb_build_object('ok',true,'deletable',deletable,'blocked',blocked);
end $$;
create or replace function public.romiku_delete_order_controlled(order_uuid uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare policy jsonb; child record; outcome jsonb; message text;
begin
 -- FK inserts require KEY SHARE on these rows. Lock before the fresh policy read.
 perform 1 from public.romiku_orders where id=order_uuid for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','记录不存在。','dependencies','{}'::jsonb); end if;
 perform 1 from public.romiku_production_orders where order_id=order_uuid order by id for update;
 policy:=public.romiku_order_delete_eligibility(order_uuid);
 if policy->>'delete_mode'='blocked' then
  if (policy->>'payment_count')::int>0 then
   message:='该订单存在收款历史，不能永久删除。可以作废订单。';
  elsif (policy->>'packing_count')::int>0 then
   message:=format('该订单已有 %s 张生产单、%s 张装箱单、%s 条收款记录，无法删除。',policy->>'production_count',policy->>'packing_count',policy->>'payment_count');
  else select string_agg(value,' ') into message from jsonb_array_elements_text(policy->'blocked_reasons'); end if;
  return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM','message',message,'dependencies',jsonb_build_object('production',(policy->>'production_count')::int,'packing',(policy->>'packing_count')::int,'payments',(policy->>'payment_count')::int));
 end if;
 for child in select id from public.romiku_production_orders where order_id=order_uuid order by id loop
  outcome:=public.romiku_delete_record('production',child.id);
  -- A returned child failure MUST raise here so this exception block restores
  -- earlier children and task links, not just the child that failed.
  if outcome->>'ok' is distinct from 'true' then raise exception 'controlled child delete failed'; end if;
 end loop;
 update public.romiku_manual_tasks set order_id=null where order_id=order_uuid;
 delete from public.romiku_order_items where order_id=order_uuid;
 delete from public.romiku_orders where id=order_uuid;
 -- Numbering ledgers and barcode reservations deliberately survive the document.
 return jsonb_build_object('ok',true);
exception when others then
 return jsonb_build_object('ok',false,'code','DELETE_FAILED','message','删除失败，记录未被更改。请刷新后重试或联系管理员。','dependencies','{}'::jsonb);
end $$;
create or replace function public.romiku_batch_delete_orders(ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; label text; outcome jsonb; deleted jsonb:='[]'; failed jsonb:='[]';
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 张订单。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  select document_number into label from public.romiku_orders where id=v;
  outcome:=public.romiku_delete_record('order',v);
  outcome:=outcome||jsonb_build_object('order_id',v,'document_number',coalesce(label,'订单不存在'));
  if outcome->>'ok'='true' then deleted:=deleted||jsonb_build_array(outcome);
  else failed:=failed||jsonb_build_array(outcome||jsonb_build_object('status',case when outcome->>'code'='HAS_DOWNSTREAM' then 'blocked_at_execution' else 'failed' end)); end if;
 end loop;
 return jsonb_build_object('ok',true,'deleted',deleted,'failed',failed);
end $$;
revoke all on function public.romiku_normalize_workflow_status() from public,anon,authenticated;

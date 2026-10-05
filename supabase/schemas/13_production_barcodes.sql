-- EAN-13 numbers are snapshot text, not GS1-issued identifiers.
create or replace function public.romiku_valid_ean13(value text)
returns boolean language sql immutable parallel safe set search_path='' as $$
 select value is null or (value ~ '^[0-9]{13}$' and
 (select sum((substr(value,n,1))::integer * case when n%2=0 then 3 else 1 end)%10=0 from generate_series(1,13) n where value ~ '^[0-9]{13}$'))
$$;
revoke all on function public.romiku_valid_ean13(text) from public,anon;
grant execute on function public.romiku_valid_ean13(text) to authenticated,service_role;
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

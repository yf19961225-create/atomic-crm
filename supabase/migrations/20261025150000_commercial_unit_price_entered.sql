-- Existing Quote, PI and Order prices, including explicit zero, remain entered.
-- New unpriced lines explicitly opt out while the numeric price and amount
-- columns keep their existing non-null and calculation behavior.
alter table public.romiku_quote_items
  add column unit_price_entered boolean not null default true;

alter table public.romiku_pi_items
  add column unit_price_entered boolean not null default true;

alter table public.romiku_order_items
  add column unit_price_entered boolean not null default true;

-- Carry the explicit blank/entered distinction through Quote -> PI/Order and
-- PI -> Order, without changing the numeric prices or existing snapshots.
create or replace function public.romiku_convert_document(source_kind text, source_id uuid, target_kind text)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  source_table text;
  target_table text;
  source_items text;
  target_items text;
  source_fk text;
  target_fk text;
  lineage_column text;
  source_json jsonb;
  new_id uuid;
begin
  if source_kind = 'quote' and target_kind in ('pi','order') then
    source_table := 'romiku_quotes'; source_items := 'romiku_quote_items'; source_fk := 'quote_id';
    lineage_column := 'source_quote_item_id';
  elsif source_kind = 'pi' and target_kind = 'order' then
    source_table := 'romiku_pis'; source_items := 'romiku_pi_items'; source_fk := 'pi_id';
    lineage_column := 'source_pi_item_id';
  else
    raise exception 'Unsupported document conversion' using errcode = '23514';
  end if;
  if target_kind = 'pi' then
    target_table := 'romiku_pis'; target_items := 'romiku_pi_items'; target_fk := 'pi_id';
  else
    target_table := 'romiku_orders'; target_items := 'romiku_order_items'; target_fk := 'order_id';
  end if;
  execute format('select to_jsonb(s) from public.%I s where id = $1 for update', source_table)
    into source_json using source_id;
  if source_json is null then
    raise exception 'Source document not found' using errcode = 'P0002';
  end if;
  source_json := source_json || jsonb_build_object('source_' || source_kind || '_id', source_id);
  execute format('insert into public.%I (counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_language,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s)
    select counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_language,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s from jsonb_populate_record(null::public.%I,$1) returning id',
    target_table, case when target_kind = 'order' then ',source_pi_id' else '' end,
    case when target_kind = 'order' then ',source_pi_id' else '' end, target_table)
    into new_id using source_json;
  execute format('insert into public.%I (%I,%I,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,unit_price_entered,requirement,customer_code,notes,position)
    select $1,id,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,unit_price_entered,requirement,customer_code,notes,position from public.%I where %I=$2',
    target_items,target_fk,lineage_column,source_items,source_fk) using new_id,source_id;
  return new_id;
end;
$function$;

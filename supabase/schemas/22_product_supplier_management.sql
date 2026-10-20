-- Product supplier identity and history are preserved across edit and replacement.
-- This migration must stop if historic active preferred rows conflict.
do $$
begin
  if exists (
    select 1 from public.romiku_product_suppliers
    where active and preferred
    group by sku having count(*) > 1
  ) then
    raise exception 'Multiple active preferred suppliers exist; resolve manually before migration';
  end if;
end;
$$;

create unique index if not exists romiku_product_supplier_one_active_preferred
  on public.romiku_product_suppliers (sku) where active and preferred;

create or replace function public.romiku_product_supplier_identity_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.sku, new.sanity_product_id, new.supplier_id)
     is distinct from (old.sku, old.sanity_product_id, old.supplier_id) then
    raise exception 'Product supplier identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists romiku_product_supplier_identity_guard on public.romiku_product_suppliers;
create trigger romiku_product_supplier_identity_guard
  before update of sku, sanity_product_id, supplier_id on public.romiku_product_suppliers
  for each row execute function public.romiku_product_supplier_identity_guard();

drop policy if exists romiku_delete on public.romiku_product_suppliers;
revoke delete on public.romiku_product_suppliers from authenticated, anon;

create or replace function public.romiku_save_product_supplier(
  relation_id uuid, supplier_item_number text, moq numeric, lead_days integer,
  preferred boolean, qty_per_carton numeric, length_cm numeric, width_cm numeric,
  height_cm numeric, carton_weight_kg numeric, reference_date date, notes text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.romiku_product_suppliers%rowtype;
declare locked_sku text;
begin
  if auth.uid() is null or current_setting('role', true) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  select sku into locked_sku from public.romiku_product_suppliers where id = relation_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(locked_sku, 0));
  select * into r from public.romiku_product_suppliers where id = relation_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not r.active then return jsonb_build_object('ok', false, 'code', 'INACTIVE'); end if;
  if preferred then
    update public.romiku_product_suppliers as ps set preferred = false
    where ps.sku = r.sku and ps.id <> r.id and ps.preferred;
  end if;
  update public.romiku_product_suppliers set
    supplier_item_number = romiku_save_product_supplier.supplier_item_number,
    moq = romiku_save_product_supplier.moq,
    lead_days = romiku_save_product_supplier.lead_days,
    preferred = coalesce(romiku_save_product_supplier.preferred, false),
    qty_per_carton = romiku_save_product_supplier.qty_per_carton,
    length_cm = romiku_save_product_supplier.length_cm,
    width_cm = romiku_save_product_supplier.width_cm,
    height_cm = romiku_save_product_supplier.height_cm,
    carton_weight_kg = romiku_save_product_supplier.carton_weight_kg,
    reference_date = romiku_save_product_supplier.reference_date,
    notes = romiku_save_product_supplier.notes
  where id = r.id;
  return jsonb_build_object('ok', true, 'relationId', r.id);
end;
$$;

create or replace function public.romiku_replace_product_supplier(
  source_relation_id uuid, target_supplier_id uuid, make_preferred boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare source_row public.romiku_product_suppliers%rowtype;
declare target_row public.romiku_product_suppliers%rowtype;
declare target_is_preferred boolean;
declare was_reactivated boolean := false;
declare locked_sku text;
begin
  if auth.uid() is null or current_setting('role', true) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  select sku into locked_sku from public.romiku_product_suppliers where id = source_relation_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(locked_sku, 0));
  select * into source_row from public.romiku_product_suppliers
    where id = source_relation_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not source_row.active then return jsonb_build_object('ok', false, 'code', 'INACTIVE'); end if;
  if not exists (select 1 from public.romiku_suppliers where id = target_supplier_id) then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND');
  end if;
  select * into target_row from public.romiku_product_suppliers
    where sku = source_row.sku and supplier_id = target_supplier_id for update;
  if found and target_row.active then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_LINKED');
  end if;
  target_is_preferred := source_row.preferred or coalesce(make_preferred, false);
  -- Source row lock also serializes inserts of cost history through romiku_parent_lock.
  update public.romiku_product_suppliers set active = false, preferred = false
    where id = source_row.id;
  if target_is_preferred then
    update public.romiku_product_suppliers set preferred = false
    where sku = source_row.sku and preferred;
  end if;
  if target_row.id is not null then
    was_reactivated := true;
    update public.romiku_product_suppliers
      set active = true, preferred = target_is_preferred
      where id = target_row.id;
  else
    insert into public.romiku_product_suppliers
      (sku, sanity_product_id, supplier_id, active, preferred)
      values (source_row.sku, source_row.sanity_product_id, target_supplier_id, true, target_is_preferred)
      returning * into target_row;
  end if;
  return jsonb_build_object('ok', true, 'sourceRelationId', source_row.id,
    'targetRelationId', target_row.id, 'reactivated', was_reactivated);
end;
$$;

create or replace function public.romiku_delete_product_supplier(relation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.romiku_product_suppliers%rowtype;
declare cost_count integer;
declare locked_sku text;
begin
  if auth.uid() is null or current_setting('role', true) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  select sku into locked_sku from public.romiku_product_suppliers where id = relation_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(locked_sku, 0));
  select * into r from public.romiku_product_suppliers where id = relation_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select count(*) into cost_count from public.romiku_procurement_cost_history
    where product_supplier_id = r.id;
  if cost_count > 0 then
    return jsonb_build_object('ok', false, 'code', 'HAS_COST_HISTORY',
      'costHistoryCount', cost_count,
      'message', pg_catalog.format('该供应商关联已有 %s 条成本历史，不能删除。', cost_count));
  end if;
  delete from public.romiku_product_suppliers where id = r.id;
  return jsonb_build_object('ok', true, 'relationId', r.id);
end;
$$;

revoke all on function public.romiku_product_supplier_identity_guard() from public, anon, authenticated;
revoke all on function public.romiku_save_product_supplier(uuid,text,numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,date,text) from public, anon, authenticated;
revoke all on function public.romiku_replace_product_supplier(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.romiku_delete_product_supplier(uuid) from public, anon, authenticated;
grant execute on function public.romiku_save_product_supplier(uuid,text,numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,date,text) to authenticated;
grant execute on function public.romiku_replace_product_supplier(uuid,uuid,boolean) to authenticated;
grant execute on function public.romiku_delete_product_supplier(uuid) to authenticated;

create or replace function public.romiku_preview_bulk_product_suppliers(
  products jsonb, supplier_ids uuid[], preferred_supplier_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p jsonb;
declare sku_value text;
declare product_id text;
declare supplier_id_value uuid;
declare relation_row public.romiku_product_suppliers%rowtype;
declare valid_skus text[] := '{}';
declare invalid_skus text[] := '{}';
declare sorted_suppliers uuid[];
declare added integer := 0;
declare reactivated integer := 0;
declare skipped integer := 0;
declare fingerprint text := '';
declare relation_state text;
declare preferred_changes integer := 0;
begin
  if auth.uid() is null or current_setting('role', true) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if pg_catalog.jsonb_typeof(products) is distinct from 'array'
     or pg_catalog.jsonb_array_length(products) < 1
     or pg_catalog.jsonb_array_length(products) > 50 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PRODUCT_COUNT');
  end if;
  select pg_catalog.array_agg(id order by id) into sorted_suppliers
  from (select distinct unnest(supplier_ids) id) selected;
  if coalesce(pg_catalog.cardinality(sorted_suppliers), 0) < 1
     or pg_catalog.cardinality(sorted_suppliers) > 10
     or pg_catalog.cardinality(sorted_suppliers) <> pg_catalog.cardinality(supplier_ids) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SUPPLIERS');
  end if;
  if preferred_supplier_id is not null and not (preferred_supplier_id = any(sorted_suppliers)) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PREFERRED');
  end if;
  if (select count(*) from public.romiku_suppliers where id = any(sorted_suppliers))
     <> pg_catalog.cardinality(sorted_suppliers) then
    return jsonb_build_object('ok', false, 'code', 'SUPPLIER_NOT_FOUND');
  end if;

  for p in select value from pg_catalog.jsonb_array_elements(products) as e(value) loop
    sku_value := p->>'sku';
    product_id := p->>'sanity_product_id';
    if pg_catalog.jsonb_typeof(p) <> 'object'
       or sku_value is null or pg_catalog.btrim(sku_value) = ''
       or product_id is null or pg_catalog.btrim(product_id) = ''
       or sku_value = any(valid_skus) then
      invalid_skus := pg_catalog.array_append(invalid_skus, coalesce(sku_value, ''));
    else
      valid_skus := pg_catalog.array_append(valid_skus, sku_value);
    end if;
  end loop;
  select pg_catalog.array_agg(value order by value) into valid_skus
    from unnest(valid_skus) as s(value);
  if valid_skus is not null then
    foreach sku_value in array valid_skus loop
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', id, 'supplier', supplier_id,
          'active', active, 'preferred', preferred) order by supplier_id::text), '[]'::jsonb)::text
      into relation_state from public.romiku_product_suppliers where sku = sku_value;
      fingerprint := fingerprint || pg_catalog.length(sku_value)::text || ':' || sku_value || relation_state;
      foreach supplier_id_value in array sorted_suppliers loop
        select * into relation_row from public.romiku_product_suppliers
          where sku = sku_value and supplier_id = supplier_id_value;
        if not found then added := added + 1;
        elsif relation_row.active then skipped := skipped + 1;
        else reactivated := reactivated + 1;
        end if;
      end loop;
      if preferred_supplier_id is not null and
         not exists (select 1 from public.romiku_product_suppliers
           where sku = sku_value and supplier_id = preferred_supplier_id
             and active and preferred) then
        preferred_changes := preferred_changes + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true,
    'selectedProductCount', pg_catalog.jsonb_array_length(products),
    'validProductCount', coalesce(pg_catalog.cardinality(valid_skus), 0),
    'supplierCount', pg_catalog.cardinality(sorted_suppliers),
    'newCount', added, 'reactivateCount', reactivated,
    'skipCount', skipped, 'invalidSkus', invalid_skus,
    'preferredChangeCount', preferred_changes,
    'planToken', pg_catalog.md5(products::text || sorted_suppliers::text ||
      coalesce(preferred_supplier_id::text, '') || fingerprint));
end;
$$;

create or replace function public.romiku_apply_bulk_product_suppliers(
  products jsonb, supplier_ids uuid[], preferred_supplier_id uuid,
  expected_plan_token text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare plan jsonb;
declare sku_value text;
declare supplier_id_value uuid;
declare p jsonb;
declare target_row public.romiku_product_suppliers%rowtype;
declare sorted_suppliers uuid[];
declare seen_skus text[] := '{}';
begin
  if auth.uid() is null or current_setting('role', true) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if pg_catalog.jsonb_typeof(products) is distinct from 'array'
     or pg_catalog.jsonb_array_length(products) < 1
     or pg_catalog.jsonb_array_length(products) > 50 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PRODUCT_COUNT');
  end if;
  -- Lock the exact page SKU set in stable order before recalculating the plan.
  for sku_value in
    select distinct value->>'sku' from pg_catalog.jsonb_array_elements(products) as e(value)
    where pg_catalog.btrim(coalesce(value->>'sku', '')) <> ''
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sku_value, 0));
  end loop;
  plan := public.romiku_preview_bulk_product_suppliers(products, supplier_ids, preferred_supplier_id);
  if plan->>'ok' <> 'true' then return plan; end if;
  if expected_plan_token is null or expected_plan_token <> plan->>'planToken' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_STALE');
  end if;
  select pg_catalog.array_agg(id order by id) into sorted_suppliers
    from (select distinct unnest(supplier_ids) id) selected;
  for p in select value from pg_catalog.jsonb_array_elements(products) with ordinality as e(value, ordinal)
    where pg_catalog.btrim(coalesce(value->>'sku', '')) <> ''
      and pg_catalog.btrim(coalesce(value->>'sanity_product_id', '')) <> ''
    order by value->>'sku', ordinal
  loop
    sku_value := p->>'sku';
    -- Only one row per exact SKU from the page is applied.
    if not sku_value = any(seen_skus) then
      seen_skus := pg_catalog.array_append(seen_skus, sku_value);
      foreach supplier_id_value in array sorted_suppliers loop
        select * into target_row from public.romiku_product_suppliers
          where sku = sku_value and supplier_id = supplier_id_value for update;
        if not found then
          insert into public.romiku_product_suppliers
            (sku,sanity_product_id,supplier_id,active,preferred)
            values (sku_value,p->>'sanity_product_id',supplier_id_value,true,false);
        elsif not target_row.active then
          update public.romiku_product_suppliers set active = true, preferred = false
            where id = target_row.id;
        end if;
      end loop;
      if preferred_supplier_id is not null then
        update public.romiku_product_suppliers set preferred = false
          where sku = sku_value and preferred and supplier_id <> preferred_supplier_id;
        update public.romiku_product_suppliers set preferred = true
          where sku = sku_value and supplier_id = preferred_supplier_id and active;
      end if;
    end if;
  end loop;
  return plan || pg_catalog.jsonb_build_object('applied', true);
end;
$$;

revoke all on function public.romiku_preview_bulk_product_suppliers(jsonb,uuid[],uuid) from public, anon, authenticated;
revoke all on function public.romiku_apply_bulk_product_suppliers(jsonb,uuid[],uuid,text) from public, anon, authenticated;
grant execute on function public.romiku_preview_bulk_product_suppliers(jsonb,uuid[],uuid) to authenticated;
grant execute on function public.romiku_apply_bulk_product_suppliers(jsonb,uuid[],uuid,text) to authenticated;

begin;

alter table public.romiku_packing_lists
  alter column order_id drop not null,
  alter column packing_at set default now();

alter table public.romiku_packing_items
  alter column order_id drop not null,
  alter column source_order_item_id drop not null,
  add constraint romiku_packing_items_order_source_pair_check
    check ((order_id is null) = (source_order_item_id is null)) not valid,
  add constraint romiku_packing_items_packing_list_id_fkey
    foreign key (packing_list_id) references public.romiku_packing_lists(id) not valid;

alter table public.romiku_packing_items
  validate constraint romiku_packing_items_order_source_pair_check,
  validate constraint romiku_packing_items_packing_list_id_fkey;

create or replace function public.romiku_check_packing_quantity() returns trigger
    language plpgsql
    set search_path to ''
    as $$
declare
  ordered numeric;
  packed numeric;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Packing requires READ COMMITTED; retry the transaction' using errcode = '40001';
  end if;
  if tg_op = 'UPDATE' and (new.source_order_item_id,new.order_id,new.packing_list_id)
    is distinct from (old.source_order_item_id,old.order_id,old.packing_list_id) then
    raise exception 'Packing item source is immutable' using errcode = '23514';
  end if;
  if (new.source_order_item_id is null) <> (new.order_id is null) then
    raise exception 'Packing item requires Order and Order item source together or neither' using errcode = '23514';
  end if;
  if new.source_order_item_id is null then
    return new;
  end if;
  select i.quantity into ordered from public.romiku_order_items i
    where i.id = new.source_order_item_id and i.order_id = new.order_id for update;
  if not found then
    raise exception 'Packing source must belong to the order' using errcode = '23503';
  end if;
  select coalesce(sum(i.quantity),0) into packed from public.romiku_packing_items i
    where i.source_order_item_id = new.source_order_item_id and i.id <> new.id;
  if packed + new.quantity > ordered then
    raise exception 'Packed quantity exceeds remaining ordered quantity' using errcode = '23514';
  end if;
  return new;
end;
$$;

commit;

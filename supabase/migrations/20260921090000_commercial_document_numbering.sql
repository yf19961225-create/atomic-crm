-- Quote, PI and Order numbers are allocated atomically per Shanghai business
-- date. Production numbers are allocated atomically within their Order.
create table public.romiku_document_daily_counters (
  document_kind text not null check (document_kind in ('quote', 'pi', 'order')),
  business_date date not null,
  last_value integer not null check (last_value > 0),
  primary key (document_kind, business_date)
);

create table public.romiku_production_order_counters (
  order_id uuid primary key references public.romiku_orders(id),
  last_value integer not null check (last_value > 0)
);

alter table public.romiku_document_daily_counters enable row level security;
alter table public.romiku_production_order_counters enable row level security;

create or replace function public.romiku_next_daily_document_number(
  kind text,
  prefix text
) returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  local_date date := (now() at time zone 'Asia/Shanghai')::date;
  next_value integer;
begin
  insert into public.romiku_document_daily_counters(document_kind, business_date, last_value)
  values (kind, local_date, 1)
  on conflict (document_kind, business_date)
  do update set last_value = public.romiku_document_daily_counters.last_value + 1
  returning last_value into next_value;

  return prefix || to_char(local_date, 'YYMMDD') || lpad(next_value::text, 3, '0');
end;
$$;

create or replace function public.romiku_assign_number() returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  prefix_value text;
  digits integer;
  sequence_value text;
begin
  if tg_op = 'UPDATE' then
    new.document_number := btrim(coalesce(new.document_number, ''));
    if new.document_number = '' then
      raise exception 'Document number is required' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.document_number is not null then
    raise exception 'Document number is server generated' using errcode = '23514';
  end if;

  if tg_argv[0] = 'quote' then
    new.document_number := public.romiku_next_daily_document_number('quote', 'RFQ');
  elsif tg_argv[0] = 'pi' then
    new.document_number := public.romiku_next_daily_document_number('pi', 'RPI');
  elsif tg_argv[0] = 'order' then
    new.document_number := public.romiku_next_daily_document_number('order', 'RCI');
  else
    select r.prefix, r.min_digits into prefix_value, digits
      from public.romiku_numbering_rules r where r.document_kind = tg_argv[0];
    prefix_value := coalesce(prefix_value, tg_argv[1]);
    digits := coalesce(digits, 6);
    sequence_value := nextval('public.romiku_document_number_seq')::text;
    new.document_number := prefix_value || '-' || lpad(sequence_value, greatest(digits, length(sequence_value)), '0');
  end if;
  return new;
end;
$$;

create or replace function public.romiku_assign_production_number() returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  order_number text;
  next_value integer;
begin
  if tg_op = 'UPDATE' then
    new.document_number := btrim(coalesce(new.document_number, ''));
    if new.document_number = '' then
      raise exception 'Document number is required' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.document_number is not null then
    raise exception 'Document number is server generated' using errcode = '23514';
  end if;

  select document_number into strict order_number
    from public.romiku_orders where id = new.order_id for key share;
  insert into public.romiku_production_order_counters(order_id, last_value)
  values (new.order_id, 1)
  on conflict (order_id)
  do update set last_value = public.romiku_production_order_counters.last_value + 1
  returning last_value into next_value;
  new.document_number := order_number || '-P' || lpad(next_value::text, 2, '0');
  return new;
end;
$$;

drop trigger romiku_number on public.romiku_production_orders;
create trigger romiku_number before insert or update on public.romiku_production_orders
for each row execute function public.romiku_assign_production_number();

revoke all on table public.romiku_document_daily_counters from public, anon, authenticated;
revoke all on table public.romiku_production_order_counters from public, anon, authenticated;
revoke all on function public.romiku_next_daily_document_number(text, text) from public, anon, authenticated;
revoke all on function public.romiku_assign_number() from public, anon, authenticated;
revoke all on function public.romiku_assign_production_number() from public, anon, authenticated;
grant execute on function public.romiku_assign_number() to authenticated, service_role;
grant execute on function public.romiku_assign_production_number() to authenticated, service_role;

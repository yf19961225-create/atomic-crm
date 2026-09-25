-- Keep the daily document counter synchronized with existing automatic numbers.
-- This self-heals stale Preview counters without touching historical documents.
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
  date_key text := to_char((now() at time zone 'Asia/Shanghai')::date, 'YYMMDD');
  existing_max integer := 0;
  next_value integer;
  candidate text;
  candidate_exists boolean;
begin
  if (kind, prefix) not in (('quote', 'RFQ'), ('pi', 'RPI'), ('order', 'RCI')) then
    raise exception 'Unsupported daily document number kind/prefix: %/%', kind, prefix
      using errcode = '22023';
  end if;

  -- Serialize allocations for one kind and Shanghai business day before reading
  -- historical documents. This allows a stale counter to self-heal safely.
  perform pg_advisory_xact_lock(hashtextextended(format('romiku-daily-number:%s:%s', kind, local_date), 0));

  case kind
    when 'quote' then
      select coalesce(max((substring(document_number, '^' || prefix || date_key || '([0-9]+)$'))::integer), 0)
        into existing_max
      from public.romiku_quotes
      where document_number ~ ('^' || prefix || date_key || '[0-9]+$');
    when 'pi' then
      select coalesce(max((substring(document_number, '^' || prefix || date_key || '([0-9]+)$'))::integer), 0)
        into existing_max
      from public.romiku_pis
      where document_number ~ ('^' || prefix || date_key || '[0-9]+$');
    when 'order' then
      select coalesce(max((substring(document_number, '^' || prefix || date_key || '([0-9]+)$'))::integer), 0)
        into existing_max
      from public.romiku_orders
      where document_number ~ ('^' || prefix || date_key || '[0-9]+$');
  end case;

  loop
    insert into public.romiku_document_daily_counters(document_kind, business_date, last_value)
    values (kind, local_date, greatest(existing_max, 0) + 1)
    on conflict (document_kind, business_date)
    do update set last_value = greatest(
      public.romiku_document_daily_counters.last_value,
      existing_max
    ) + 1
    returning last_value into next_value;

    candidate := prefix || date_key || lpad(next_value::text, 3, '0');
    case kind
      when 'quote' then select exists(select 1 from public.romiku_quotes where document_number = candidate) into candidate_exists;
      when 'pi' then select exists(select 1 from public.romiku_pis where document_number = candidate) into candidate_exists;
      when 'order' then select exists(select 1 from public.romiku_orders where document_number = candidate) into candidate_exists;
    end case;

    if not candidate_exists then
      return candidate;
    end if;

    -- Defensive retry for a legacy/historical number that appeared after the
    -- high-watermark scan. The same transaction lock keeps allocators ordered.
    existing_max := greatest(existing_max, next_value);
  end loop;
end;
$$;

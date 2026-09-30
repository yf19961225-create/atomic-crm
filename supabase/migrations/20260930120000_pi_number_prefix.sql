-- Keep historic RPI counters isolated while all newly created PIs use PIYYMMDDNNN.
alter table public.romiku_document_daily_counters
  add column if not exists number_prefix text;

update public.romiku_document_daily_counters
set number_prefix = case document_kind
  when 'quote' then 'RFQ'
  when 'pi' then 'RPI'
  when 'order' then 'OD'
end
where number_prefix is null;

alter table public.romiku_document_daily_counters
  alter column number_prefix set not null;

alter table public.romiku_document_daily_counters
  drop constraint if exists romiku_document_daily_counters_pkey;
alter table public.romiku_document_daily_counters
  add primary key (document_kind, business_date, number_prefix);

create or replace function public.romiku_next_daily_document_number(kind text, prefix text)
returns text language plpgsql security definer set search_path to '' as $$
declare
  local_date date := (now() at time zone 'Asia/Shanghai')::date;
  date_key text := to_char(local_date, 'YYMMDD');
  existing_max integer := 0;
  next_value integer;
  candidate text;
  candidate_exists boolean;
begin
  if (kind, prefix) not in (('quote','RFQ'),('pi','PI'),('order','OD')) then
    raise exception 'Unsupported daily document number kind/prefix: %/%', kind, prefix using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(format('romiku-daily-number:%s:%s:%s',kind,prefix,local_date),0));
  case kind
    when 'quote' then select coalesce(max((substring(document_number,'^'||prefix||date_key||'([0-9]+)$'))::integer),0) into existing_max from public.romiku_quotes where document_number ~ ('^'||prefix||date_key||'[0-9]+$');
    when 'pi' then select coalesce(max((substring(document_number,'^'||prefix||date_key||'([0-9]+)$'))::integer),0) into existing_max from public.romiku_pis where document_number ~ ('^'||prefix||date_key||'[0-9]+$');
    when 'order' then select coalesce(max((substring(document_number,'^'||prefix||date_key||'([0-9]+)$'))::integer),0) into existing_max from public.romiku_orders where document_number ~ ('^'||prefix||date_key||'[0-9]+$');
  end case;
  loop
    insert into public.romiku_document_daily_counters(document_kind,business_date,number_prefix,last_value)
    values(kind,local_date,prefix,greatest(existing_max,0)+1)
    on conflict(document_kind,business_date,number_prefix) do update
      set last_value=greatest(public.romiku_document_daily_counters.last_value,existing_max)+1
    returning last_value into next_value;
    candidate := prefix||date_key||lpad(next_value::text,3,'0');
    case kind
      when 'quote' then select exists(select 1 from public.romiku_quotes where document_number=candidate) into candidate_exists;
      when 'pi' then select exists(select 1 from public.romiku_pis where document_number=candidate) into candidate_exists;
      when 'order' then select exists(select 1 from public.romiku_orders where document_number=candidate) into candidate_exists;
    end case;
    if not candidate_exists then return candidate; end if;
    existing_max := greatest(existing_max,next_value);
  end loop;
end;
$$;

create or replace function public.romiku_assign_number() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op='UPDATE' then
    new.document_number:=btrim(coalesce(new.document_number,''));
    if new.document_number='' then raise exception 'Document number is required' using errcode='23514'; end if;
    return new;
  end if;
  if new.document_number is not null then raise exception 'Document number is server generated' using errcode='23514'; end if;
  if tg_argv[0]='quote' then new.document_number:=public.romiku_next_daily_document_number('quote','RFQ');
  elsif tg_argv[0]='pi' then new.document_number:=public.romiku_next_daily_document_number('pi','PI');
  elsif tg_argv[0]='order' then new.document_number:=public.romiku_next_daily_document_number('order','OD');
  else new.document_number:=coalesce((select prefix from public.romiku_numbering_rules where document_kind=tg_argv[0]),tg_argv[1])||'-'||lpad(nextval('public.romiku_document_number_seq')::text,6,'0');
  end if;
  return new;
end;
$$;

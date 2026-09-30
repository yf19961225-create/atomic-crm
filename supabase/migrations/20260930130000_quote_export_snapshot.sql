-- Every newly created Quote owns its Seller snapshot. This preserves the
-- fixed Quote template data without adding a master record or changing
-- historical Quotes that intentionally retain their existing snapshots.
create or replace function public.romiku_quote_export_snapshot_default()
returns trigger language plpgsql set search_path to '' as $$
begin
  if not (coalesce(new.terms_snapshot, '{}'::jsonb) ? 'quote_export') then
    new.terms_snapshot := coalesce(new.terms_snapshot, '{}'::jsonb) || jsonb_build_object(
      'quote_export', jsonb_build_object(
        'template_key', 'quote',
        'seller', jsonb_build_object(
          'company_name', 'YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲',
          'address', E'72790, 3rd Street, Unit 4, 2nd Floor, Gate 153,Global Digital Trade Center Yiwu,China\n义乌市国际商贸城六区152号门2楼4单元3街72790',
          'tel_whatsapp', '+86 190 2577 7589',
          'website', 'www.romiku.com',
          'email', 'info@romiku.com'
        )
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists romiku_quote_export_snapshot_default on public.romiku_quotes;
create trigger romiku_quote_export_snapshot_default
before insert on public.romiku_quotes
for each row execute function public.romiku_quote_export_snapshot_default();

revoke all on function public.romiku_quote_export_snapshot_default() from public, anon, authenticated;

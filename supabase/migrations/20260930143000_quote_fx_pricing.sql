-- Quote-only FX metadata and RMB source prices. The established final
-- commercial price remains romiku_quote_items.unit_price numeric(18,4).
alter table public.romiku_quotes
  add column fx_enabled boolean not null default false,
  add column usd_cny_rate numeric(18,6),
  add constraint romiku_quotes_usd_cny_rate_check
    check (usd_cny_rate is null or usd_cny_rate > 0);

alter table public.romiku_quote_items
  add column source_cny_unit_price numeric(18,4),
  add constraint romiku_quote_items_source_cny_unit_price_check
    check (source_cny_unit_price is null or source_cny_unit_price >= 0);

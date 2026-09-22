alter table public.romiku_production_orders
  alter column supplier_id drop not null,
  alter column supplier_snapshot drop not null,
  alter column supplier_snapshot drop default;

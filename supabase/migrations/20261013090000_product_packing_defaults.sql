-- Product-level CRM packing defaults. Existing supplier values remain intact.
alter table public.romiku_product_extensions
  add column qty_per_carton numeric(18,4) check (qty_per_carton > 0),
  add column length_cm numeric(12,4) check (length_cm >= 0),
  add column width_cm numeric(12,4) check (width_cm >= 0),
  add column height_cm numeric(12,4) check (height_cm >= 0),
  add column carton_weight_kg numeric(12,4) check (carton_weight_kg >= 0);

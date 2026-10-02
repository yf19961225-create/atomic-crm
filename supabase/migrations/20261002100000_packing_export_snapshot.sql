begin;

alter table public.romiku_packing_lists
  add column seller_snapshot jsonb not null default '{}',
  add column buyer_snapshot jsonb not null default '{}';

-- Seed the Seller once from the approved Packing List template. Only a truly
-- empty document snapshot is eligible: user-entered history is never changed.
update public.romiku_packing_lists
set seller_snapshot = jsonb_build_object(
  'company_name', 'YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲',
  'address', '72790, 3rd Street, Unit 4, 2nd Floor, Gate 153,Global Digital Trade Center Yiwu,China',
  'tel_whatsapp', '+86 190 2577 7589',
  'website', 'www.romiku.com',
  'email', 'info@romiku.com'
)
where jsonb_typeof(seller_snapshot) = 'object'
  and seller_snapshot = '{}'::jsonb;

-- Capture the source Order's already saved buyer data exactly once. This never
-- reads Formal Customer data and preserves any non-empty Packing snapshot.
update public.romiku_packing_lists as packing
set buyer_snapshot = orders.counterparty_snapshot
from public.romiku_orders as orders
where packing.order_id = orders.id
  and jsonb_typeof(packing.buyer_snapshot) = 'object'
  and packing.buyer_snapshot = '{}'::jsonb
  and jsonb_typeof(orders.counterparty_snapshot) = 'object';

commit;

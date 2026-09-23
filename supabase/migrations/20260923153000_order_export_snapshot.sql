-- Order export details are a document snapshot.  No new master table or
-- column is needed: terms_snapshot already belongs to the Order.
update public.romiku_orders
set terms_snapshot = coalesce(terms_snapshot, '{}'::jsonb) || jsonb_build_object(
  'order_export', jsonb_build_object(
    'template_key', 'order',
    'seller', jsonb_build_object(
      'company_name', 'YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲',
      'address', '72790, 3rd Street, Unit 4, 2nd Floor, Gate 153, Global Digital Trade Center Yiwu, China',
      'tel_whatsapp', '+86 190 2577 7589',
      'website', 'www.romiku.com',
      'email', 'info@romiku.com'
    ),
    'terms', jsonb_build_object(
      'payment', jsonb_build_object('visible', true, 'text', 'Payment terms as agreed by both parties.'),
      'bank_charges', jsonb_build_object('text', 'All bank charges are borne by the buyer.'),
      'cancellation_deposit', jsonb_build_object('text', 'Deposit is non-refundable after production starts.'),
      'quality_claim', jsonb_build_object('text', 'Quality claims must be raised promptly after receipt.'),
      'force_majeure', jsonb_build_object('text', 'Neither party is liable for force majeure events.'),
      'dispute_settlement', jsonb_build_object('text', 'Disputes will be settled through friendly consultation.'),
      'delivery_lead_time', jsonb_build_object('text', 'Delivery lead time is subject to the confirmed order.'),
      'packaging', jsonb_build_object('text', 'Standard export packaging unless otherwise agreed.')
    )
  )
)
where not (coalesce(terms_snapshot, '{}'::jsonb) ? 'order_export');

create or replace function public.romiku_order_export_snapshot_default()
returns trigger language plpgsql as $$
begin
  if not (coalesce(new.terms_snapshot, '{}'::jsonb) ? 'order_export') then
    new.terms_snapshot := coalesce(new.terms_snapshot, '{}'::jsonb) || jsonb_build_object(
      'order_export', jsonb_build_object(
        'template_key', 'order',
        'seller', jsonb_build_object('company_name','YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲','address','72790, 3rd Street, Unit 4, 2nd Floor, Gate 153, Global Digital Trade Center Yiwu, China','tel_whatsapp','+86 190 2577 7589','website','www.romiku.com','email','info@romiku.com'),
        'terms', jsonb_build_object('payment',jsonb_build_object('visible',true,'text','Payment terms as agreed by both parties.'),'bank_charges',jsonb_build_object('text','All bank charges are borne by the buyer.'),'cancellation_deposit',jsonb_build_object('text','Deposit is non-refundable after production starts.'),'quality_claim',jsonb_build_object('text','Quality claims must be raised promptly after receipt.'),'force_majeure',jsonb_build_object('text','Neither party is liable for force majeure events.'),'dispute_settlement',jsonb_build_object('text','Disputes will be settled through friendly consultation.'),'delivery_lead_time',jsonb_build_object('text','Delivery lead time is subject to the confirmed order.'),'packaging',jsonb_build_object('text','Standard export packaging unless otherwise agreed.'))
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists romiku_order_export_snapshot_default on public.romiku_orders;
create trigger romiku_order_export_snapshot_default
before insert on public.romiku_orders
for each row execute function public.romiku_order_export_snapshot_default();

revoke all on function public.romiku_order_export_snapshot_default() from public, anon, authenticated;

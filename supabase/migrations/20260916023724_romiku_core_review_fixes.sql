drop policy "romiku_admin_write" on "public"."romiku_numbering_rules";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.romiku_preserve_cost_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF (NEW.sku,NEW.sanity_product_id,NEW.supplier_id)
     IS DISTINCT FROM (OLD.sku,OLD.sanity_product_id,OLD.supplier_id) THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Product identity edits require READ COMMITTED; retry the transaction' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.romiku_procurement_cost_history h WHERE h.product_supplier_id=OLD.id) THEN
      RAISE EXCEPTION 'Product supplier identity is immutable after cost history exists' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_preserve_payment_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Order currency edits require READ COMMITTED; retry the transaction' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.romiku_payments p WHERE p.order_id=OLD.id) THEN
      RAISE EXCEPTION 'Order currency is immutable after payments exist' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

create or replace view "public"."romiku_order_item_remaining" as  SELECT i.id,
    i.order_id,
    i.sku,
    i.quantity AS ordered_quantity,
    COALESCE(p.quantity, (0)::numeric) AS packed_quantity,
    (i.quantity - COALESCE(p.quantity, (0)::numeric)) AS remaining_quantity,
    COALESCE(w.quantity, (0)::numeric) AS production_quantity,
    (i.quantity - COALESCE(w.quantity, (0)::numeric)) AS unallocated_quantity
   FROM ((public.romiku_order_items i
     LEFT JOIN ( SELECT romiku_packing_items.source_order_item_id,
            sum(romiku_packing_items.quantity) AS quantity
           FROM public.romiku_packing_items
          GROUP BY romiku_packing_items.source_order_item_id) p ON ((p.source_order_item_id = i.id)))
     LEFT JOIN ( SELECT pi.source_order_item_id,
            sum(pi.quantity) AS quantity
           FROM (public.romiku_production_items pi
             JOIN public.romiku_production_orders po ON ((po.id = pi.production_order_id)))
          WHERE (po.status <> 'cancelled'::text)
          GROUP BY pi.source_order_item_id) w ON ((w.source_order_item_id = i.id)));



  create policy "romiku_write"
  on "public"."romiku_numbering_rules"
  as permissive
  for all
  to authenticated
using (true)
with check (true);


CREATE TRIGGER romiku_payment_currency BEFORE UPDATE OF currency ON public.romiku_orders FOR EACH ROW EXECUTE FUNCTION public.romiku_preserve_payment_currency();

CREATE TRIGGER romiku_parent_lock BEFORE INSERT OR DELETE OR UPDATE ON public.romiku_payments FOR EACH ROW EXECUTE FUNCTION public.romiku_lock_document_parent('romiku_orders', 'order_id');

CREATE TRIGGER romiku_parent_lock BEFORE INSERT ON public.romiku_procurement_cost_history FOR EACH ROW EXECUTE FUNCTION public.romiku_lock_document_parent('romiku_product_suppliers', 'product_supplier_id');

CREATE TRIGGER romiku_cost_identity BEFORE UPDATE OF sku, sanity_product_id, supplier_id ON public.romiku_product_suppliers FOR EACH ROW EXECUTE FUNCTION public.romiku_preserve_cost_identity();

-- Retain declarative security omitted by migra's default-privilege handling.
alter view public.romiku_order_item_remaining set (security_invoker = true);
revoke all on function public.romiku_preserve_cost_identity() from public, anon, authenticated;
grant execute on function public.romiku_preserve_cost_identity() to authenticated, service_role;
revoke all on function public.romiku_preserve_payment_currency() from public, anon, authenticated;
grant execute on function public.romiku_preserve_payment_currency() to authenticated, service_role;

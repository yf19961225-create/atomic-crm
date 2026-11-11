-- LOCAL REVIEW CANDIDATE: not approved for remote application.
-- Enforce active CRM membership at actual business mutations, including definer RPCs.
-- Does not change RLS policy shapes, existing object owners, or existing ACLs.
CREATE FUNCTION public.romiku_require_active_business_writer() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
DECLARE caller text := coalesce(nullif(current_setting('role', true), 'none'), session_user);
BEGIN
  IF caller = 'anon' THEN
    RAISE EXCEPTION 'Active CRM membership required' USING ERRCODE = '42501';
  ELSIF caller = 'authenticated' THEN
    -- Separate branch: trusted definer owners need no EXECUTE on the CRM guard.
    IF NOT public.romiku_wb_active() THEN
      RAISE EXCEPTION 'Active CRM membership required' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
-- Trigger invocation does not need client EXECUTE privileges; no callable RPC surface.
REVOKE ALL ON FUNCTION public.romiku_require_active_business_writer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_quotes
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_quote_items
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_quote_versions
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_pis
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_pi_items
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_orders
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_order_items
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_payments
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_suppliers
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_supplier_contacts
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_production_orders
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_production_items
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_production_followups
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_production_barcodes
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_packing_lists
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_packing_items
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_website_inquiries
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_website_inquiry_items
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_website_inquiry_followups
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();
CREATE TRIGGER romiku_active_business_writer BEFORE INSERT OR UPDATE OR DELETE ON public.romiku_manual_tasks
 FOR EACH ROW EXECUTE FUNCTION public.romiku_require_active_business_writer();

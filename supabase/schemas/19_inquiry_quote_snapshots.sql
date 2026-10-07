-- Quote source requested quantity is immutable, including legacy NULLs.
CREATE OR REPLACE FUNCTION "public"."romiku_quote_requested_quantity_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE original numeric; parent_source uuid; item_source uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.requested_quantity_snapshot IS NOT NULL AND
       (NEW.quote_id,NEW.source_website_inquiry_item_id) IS DISTINCT FROM (OLD.quote_id,OLD.source_website_inquiry_item_id) THEN
      RAISE EXCEPTION 'Requested quantity provenance is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.requested_quantity_snapshot IS DISTINCT FROM OLD.requested_quantity_snapshot THEN
      RAISE EXCEPTION 'Requested quantity snapshot is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT source_website_inquiry_id INTO parent_source FROM public.romiku_quotes WHERE id=NEW.quote_id;
  IF NEW.source_website_inquiry_item_id IS NOT NULL THEN
    SELECT quantity,inquiry_id INTO original,item_source FROM public.romiku_website_inquiry_items WHERE id=NEW.source_website_inquiry_item_id;
    IF parent_source IS NULL OR parent_source IS DISTINCT FROM item_source THEN
      RAISE EXCEPTION 'Inquiry item must belong to Quote source' USING ERRCODE='23514';
    END IF;
    NEW.requested_quantity_snapshot:=original;
  ELSIF NEW.requested_quantity_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'Requested quantity requires an Inquiry item source' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.romiku_quote_requested_quantity_guard() from public,anon,authenticated;
create trigger romiku_requested_quantity before insert or update on public.romiku_quote_items for each row execute function public.romiku_quote_requested_quantity_guard();

-- The header source selects the fixed Quote template and is creation-time provenance.
-- Inquiry conversion sets it on INSERT; ordinary edits and customer association do not.
CREATE OR REPLACE FUNCTION "public"."romiku_quote_inquiry_source_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.source_website_inquiry_id IS DISTINCT FROM OLD.source_website_inquiry_id THEN
    RAISE EXCEPTION 'Quote website inquiry provenance is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.romiku_quote_inquiry_source_guard() from public,anon,authenticated;
create trigger romiku_inquiry_source before update of source_website_inquiry_id on public.romiku_quotes for each row execute function public.romiku_quote_inquiry_source_guard();

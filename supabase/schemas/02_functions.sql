--
-- Functions
-- This file declares all PL/pgSQL functions in the public schema.
--

CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_avatar_for_email"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(extensions.digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from extensions.http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_domain_favicon"("domain_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare domain_status int8;

begin
    if exists (select from favicons_excluded_domains as fav where fav.domain = domain_name) then
        return null;
    end if;

    return concat(
        'https://favicon.show/',
        (regexp_matches(domain_name, '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)', 'i'))[1]
    );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_note_attachments_function_url"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."handle_company_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare company_logo text;

begin
    if new.logo is not null then
        return new;
    end if;

    company_logo = get_domain_favicon(new.website);
    if company_logo is null then
        return new;
    end if;

    new.logo = concat('{"src":"', company_logo, '","title":"Company favicon"}');
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_note_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then FALSE else TRUE end
  );
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."lowercase_email_jsonb"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email_jsonb IS NOT NULL THEN
    NEW.email_jsonb = COALESCE((
      SELECT jsonb_agg(
        jsonb_set(elem, '{email}', to_jsonb(LOWER(elem->>'email')))
      )
      FROM jsonb_array_elements(NEW.email_jsonb) AS elem
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

-- ROMIKU invariants and transactional conversions. No function bypasses RLS.

CREATE OR REPLACE FUNCTION "public"."romiku_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := auth.uid();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Record identity is immutable' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_assign_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  prefix_value text;
  digits integer;
  sequence_value text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document_number IS DISTINCT FROM OLD.document_number THEN
      RAISE EXCEPTION 'Document number is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.document_number IS NOT NULL THEN
    RAISE EXCEPTION 'Document number is server generated' USING ERRCODE = '23514';
  END IF;
  SELECT r.prefix, r.min_digits INTO prefix_value, digits
    FROM public.romiku_numbering_rules r WHERE r.document_kind = TG_ARGV[0];
  prefix_value := coalesce(prefix_value, TG_ARGV[1]);
  digits := coalesce(digits, 6);
  sequence_value := nextval('public.romiku_document_number_seq')::text;
  NEW.document_number := prefix_value || '-' || lpad(sequence_value, greatest(digits, length(sequence_value)), '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_preserve_inquiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Archive inquiry originals instead of deleting' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'romiku_website_inquiries' THEN
    IF (NEW.customer_name,NEW.company,NEW.email,NEW.whatsapp,NEW.country,NEW.message,NEW.raw_payload,NEW.submitted_at)
       IS DISTINCT FROM
       (OLD.customer_name,OLD.company,OLD.email,OLD.whatsapp,OLD.country,OLD.message,OLD.raw_payload,OLD.submitted_at) THEN
      RAISE EXCEPTION 'Website submission is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (NEW.inquiry_id,NEW.sku,NEW.quantity,NEW.requirement)
       IS DISTINCT FROM (OLD.inquiry_id,OLD.sku,OLD.quantity,OLD.requirement) THEN
      RAISE EXCEPTION 'Original inquiry item is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_preserve_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RAISE EXCEPTION 'History is append only' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_lock_document_parent"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
DECLARE
  parent_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW)->>TG_ARGV[1]) IS DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[1]) THEN
    RAISE EXCEPTION 'Document item parent is immutable' USING ERRCODE = '23514';
  END IF;
  parent_id := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END ->> TG_ARGV[1])::uuid;
  EXECUTE format('SELECT id FROM public.%I WHERE id = $1 FOR UPDATE', TG_ARGV[0]) USING parent_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."romiku_check_packing_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  ordered numeric;
  packed numeric;
BEGIN
  -- A fixed snapshot cannot refresh the SUM after waiting for a packing writer.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Packing requires READ COMMITTED; retry the transaction' USING ERRCODE = '40001';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.source_order_item_id,NEW.order_id,NEW.packing_list_id)
    IS DISTINCT FROM (OLD.source_order_item_id,OLD.order_id,OLD.packing_list_id) THEN
    RAISE EXCEPTION 'Packing item source is immutable' USING ERRCODE = '23514';
  END IF;
  -- Serialize every allocation against the source row. The following aggregate
  -- is a new READ COMMITTED statement after the lock, so it sees committed peers.
  SELECT i.quantity INTO ordered FROM public.romiku_order_items i
    WHERE i.id = NEW.source_order_item_id AND i.order_id = NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packing source must belong to the order' USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(sum(i.quantity),0) INTO packed FROM public.romiku_packing_items i
    WHERE i.source_order_item_id = NEW.source_order_item_id AND i.id <> NEW.id;
  IF packed + NEW.quantity > ordered THEN
    RAISE EXCEPTION 'Packed quantity exceeds remaining ordered quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_check_order_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Packing requires READ COMMITTED; retry the transaction' USING ERRCODE = '40001';
  END IF;
  IF NEW.quantity < (SELECT coalesce(sum(p.quantity),0) FROM public.romiku_packing_items p WHERE p.source_order_item_id = NEW.id) THEN
    RAISE EXCEPTION 'Order quantity cannot fall below packed quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_quote_from_inquiry"("inquiry_id" "uuid", "selected_item_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  source public.romiku_website_inquiries;
  new_id uuid;
  selected_count integer;
BEGIN
  SELECT * INTO STRICT source FROM public.romiku_website_inquiries WHERE id = inquiry_id FOR UPDATE;
  SELECT count(*) INTO selected_count FROM public.romiku_website_inquiry_items i
    WHERE i.inquiry_id = source.id AND i.id = ANY(selected_item_ids);
  IF selected_count = 0 OR selected_count <> cardinality(selected_item_ids) THEN
    RAISE EXCEPTION 'Select distinct items belonging to the inquiry' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.romiku_quotes(source_website_inquiry_id,outbound_company_id,formal_customer_id,counterparty_snapshot)
  VALUES (source.id,source.outbound_company_id,source.formal_customer_id,
    jsonb_build_object('name',source.customer_name,'company',source.company,'email',source.email,'whatsapp',source.whatsapp,'country',source.country))
  RETURNING id INTO new_id;
  INSERT INTO public.romiku_quote_items(quote_id,source_website_inquiry_item_id,sanity_product_id,sku,quantity,requirement,product_snapshot,position)
  SELECT new_id,i.id,i.sanity_product_id,i.sku,i.quantity,i.requirement,i.product_snapshot,array_position(selected_item_ids,i.id)
    FROM public.romiku_website_inquiry_items i WHERE i.id = ANY(selected_item_ids);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."romiku_convert_document"("source_kind" "text", "source_id" "uuid", "target_kind" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
DECLARE
  source_table text;
  target_table text;
  source_items text;
  target_items text;
  source_fk text;
  target_fk text;
  lineage_column text;
  source_json jsonb;
  new_id uuid;
BEGIN
  IF source_kind = 'quote' AND target_kind IN ('pi','order') THEN
    source_table := 'romiku_quotes'; source_items := 'romiku_quote_items'; source_fk := 'quote_id';
    lineage_column := 'source_quote_item_id';
  ELSIF source_kind = 'pi' AND target_kind = 'order' THEN
    source_table := 'romiku_pis'; source_items := 'romiku_pi_items'; source_fk := 'pi_id';
    lineage_column := 'source_pi_item_id';
  ELSE
    RAISE EXCEPTION 'Unsupported document conversion' USING ERRCODE = '23514';
  END IF;
  IF target_kind = 'pi' THEN
    target_table := 'romiku_pis'; target_items := 'romiku_pi_items'; target_fk := 'pi_id';
  ELSE
    target_table := 'romiku_orders'; target_items := 'romiku_order_items'; target_fk := 'order_id';
  END IF;
  EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE id = $1 FOR UPDATE',source_table)
    INTO source_json USING source_id;
  IF source_json IS NULL THEN
    RAISE EXCEPTION 'Source document not found' USING ERRCODE = 'P0002';
  END IF;
  -- Item writes also lock this header, preserving a coherent copy while converting.
  source_json := source_json || jsonb_build_object('source_' || source_kind || '_id',source_id);
  EXECUTE format('INSERT INTO public.%I (counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s)
    SELECT counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s FROM jsonb_populate_record(NULL::public.%I,$1) RETURNING id',
    target_table,CASE WHEN target_kind = 'order' THEN ',source_pi_id' ELSE '' END,
    CASE WHEN target_kind = 'order' THEN ',source_pi_id' ELSE '' END,target_table)
    INTO new_id USING source_json;
  EXECUTE format('INSERT INTO public.%I (%I,%I,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,requirement,customer_code,notes,position)
    SELECT $1,id,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,requirement,customer_code,notes,position FROM public.%I WHERE %I=$2',
    target_items,target_fk,lineage_column,source_items,source_fk) USING new_id,source_id;
  RETURN new_id;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."romiku_publish_quote_version"("quote_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  source_json jsonb;
  version_number integer;
  new_id uuid;
BEGIN
  SELECT to_jsonb(q) INTO STRICT source_json FROM public.romiku_quotes q WHERE q.id = quote_id FOR UPDATE;
  SELECT coalesce(max(v.version),0)+1 INTO version_number FROM public.romiku_quote_versions v WHERE v.quote_id = romiku_publish_quote_version.quote_id;
  INSERT INTO public.romiku_quote_versions(quote_id,version,document_snapshot,items_snapshot)
  SELECT romiku_publish_quote_version.quote_id,version_number,source_json,coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.position,i.id),'[]'::jsonb)
    FROM public.romiku_quote_items i WHERE i.quote_id = romiku_publish_quote_version.quote_id
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;


-- A historical cost keeps the ProductSupplier identity it was recorded against.
-- History inserts lock this same parent row, serializing the first cost with edits.
CREATE OR REPLACE FUNCTION "public"."romiku_preserve_cost_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;

-- Payments inherit the order currency. Once a payment exists that currency is fixed.
-- Payment inserts lock the order, so an overlapping currency change cannot race it.
CREATE OR REPLACE FUNCTION "public"."romiku_preserve_payment_currency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;

CREATE OR REPLACE FUNCTION "public"."set_sales_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sales_id IS NULL THEN
    SELECT id INTO NEW.sales_id FROM sales WHERE user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

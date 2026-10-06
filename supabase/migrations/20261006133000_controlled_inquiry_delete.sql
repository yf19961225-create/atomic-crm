-- Permit deletion of unconverted inquiries only through the authenticated controlled RPC.
CREATE OR REPLACE FUNCTION "public"."romiku_preserve_inquiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only the controlled RPC owner can use the transaction-local, record-scoped
    -- deletion permit. Authenticated callers cannot bypass this guard by setting it.
    IF current_user = pg_catalog.pg_get_userbyid(
         (SELECT proowner FROM pg_catalog.pg_proc
          WHERE oid = 'public.romiku_delete_record(text,uuid)'::regprocedure))
       AND current_setting('role', true) = 'authenticated'
       AND auth.uid() IS NOT NULL
       AND current_setting('romiku.controlled_inquiry_delete', true) =
         (to_jsonb(OLD)->>(CASE WHEN TG_TABLE_NAME = 'romiku_website_inquiries'
                              THEN 'id' ELSE 'inquiry_id' END)) THEN
      RETURN OLD;
    END IF;
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

CREATE OR REPLACE FUNCTION "public"."romiku_delete_record"("kind" "text", "record_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare pi_count int := 0; order_count int := 0; production_count int := 0; packing_count int := 0; payment_count int := 0; followup_count int := 0; inquiry_dependencies jsonb; previous_inquiry_delete text;
begin
  if auth.uid() is null or coalesce(nullif(current_setting('role', true), 'none'), session_user) <> 'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。','dependencies','{}'::jsonb); end if;
  if kind is null or kind not in ('quote','pi','order','packing','outbound','manual_task','production','website_inquiry') then return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','不支持的删除类型。','dependencies','{}'::jsonb); end if;
  -- Lock the parent before checking dependencies. FK inserts take KEY SHARE,
  -- so concurrent downstream creation cannot slip past this delete.
  case kind
    when 'website_inquiry' then perform 1 from public.romiku_website_inquiries where id=record_id for update;
    when 'quote' then perform 1 from public.romiku_quotes where id=record_id for update;
    when 'pi' then perform 1 from public.romiku_pis where id=record_id for update;
    when 'order' then perform 1 from public.romiku_orders where id=record_id for update;
    when 'production' then perform 1 from public.romiku_production_orders where id=record_id for update;
    when 'packing' then perform 1 from public.romiku_packing_lists where id=record_id for update;
    when 'outbound' then perform 1 from public.romiku_outbound_companies where id=record_id for update;
    when 'manual_task' then perform 1 from public.romiku_manual_tasks where id=record_id for update;
  end case;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','记录不存在。','dependencies','{}'::jsonb); end if;
  if kind='quote' then
    select count(*) into pi_count from public.romiku_pis where source_quote_id=record_id;
    select count(*) into order_count from public.romiku_orders where source_quote_id=record_id;
    if pi_count+order_count>0 then return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM','message',format('该报价单已有 %s 张 PI、%s 张订单，无法删除。',pi_count,order_count),'dependencies',jsonb_build_object('pi',pi_count,'orders',order_count)); end if;
    update public.romiku_manual_tasks set quote_id=null where quote_id=record_id; delete from public.romiku_quote_items where quote_id=record_id; delete from public.romiku_quote_versions where quote_id=record_id; delete from public.romiku_quotes where id=record_id;
  elsif kind='pi' then
    select count(*) into order_count from public.romiku_orders where source_pi_id=record_id;
    if order_count>0 then return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM','message',format('该 PI 已有 %s 张订单，无法删除。',order_count),'dependencies',jsonb_build_object('orders',order_count)); end if;
    update public.romiku_manual_tasks set pi_id=null where pi_id=record_id; delete from public.romiku_pi_items where pi_id=record_id; delete from public.romiku_pis where id=record_id;
  elsif kind='order' then
    return public.romiku_delete_order_controlled(record_id);
  elsif kind='production' then
    select count(*) into followup_count from public.romiku_production_followups where production_order_id=record_id;
    if followup_count>0 then
      return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM',
        'message',format('该生产单已有 %s 条生产跟进记录，无法删除。',followup_count),
        'dependencies',jsonb_build_object('production_followups',followup_count));
    end if;
    update public.romiku_manual_tasks set production_order_id=null where production_order_id=record_id;
    delete from public.romiku_production_items where production_order_id=record_id;
    delete from public.romiku_production_orders where id=record_id;
    -- The source Order, Order Items and per-Order numbering counter are retained.
  elsif kind='packing' then delete from public.romiku_packing_items where packing_list_id=record_id; delete from public.romiku_packing_lists where id=record_id;
  elsif kind='website_inquiry' then
    perform 1 from public.romiku_website_inquiry_items where inquiry_id=record_id order by id for update;
    inquiry_dependencies:=public.romiku_inquiry_dependencies(record_id);
    if exists(select 1 from jsonb_each_text(inquiry_dependencies) d where d.value::int>0) then return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM','message','该询盘已有正式客户或下游商业单据，无法删除。可根据实际情况标记为无效。','dependencies',inquiry_dependencies); end if;
    previous_inquiry_delete := current_setting('romiku.controlled_inquiry_delete',true);
    perform set_config('romiku.controlled_inquiry_delete',record_id::text,true);
    delete from public.romiku_website_inquiry_followups where inquiry_id=record_id;
    delete from public.romiku_website_inquiry_items where inquiry_id=record_id;
    delete from public.romiku_website_inquiries where id=record_id;
    perform set_config('romiku.controlled_inquiry_delete',coalesce(previous_inquiry_delete,''),true);
  elsif kind='outbound' then
    update public.romiku_formal_customers set source_outbound_company_id=null where source_outbound_company_id=record_id; update public.romiku_website_inquiries set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_quotes set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_pis set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_orders set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_manual_tasks set outbound_company_id=null where outbound_company_id=record_id;
    delete from public.romiku_outbound_followups where outbound_company_id=record_id; delete from public.romiku_source_urls where outbound_company_id=record_id; delete from public.romiku_outbound_contacts where outbound_company_id=record_id; delete from public.romiku_outbound_companies where id=record_id;
  else delete from public.romiku_manual_tasks where id=record_id; end if;
  return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'code','DELETE_FAILED','message','删除失败，记录未被更改。请刷新后重试或联系管理员。','dependencies','{}'::jsonb); end;
$$;

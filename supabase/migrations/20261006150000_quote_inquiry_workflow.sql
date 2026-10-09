-- Quote final workflow + backward-compatible optional intake WhatsApp.
-- Unknown historical values abort; no other modules' statuses are remapped.
do $$ begin
 if exists(select 1 from public.romiku_quotes where status not in ('draft','pending_quote','sent','quoted','following_up','customer_no_reply','won','invalid')) then
 raise exception 'Unmapped historical Quote status: audit required'; end if;
end $$;
alter table public.romiku_quotes drop constraint romiku_quotes_status_check;

-- Release backfill: preserve historical attribution and timestamps. Only the
-- audit trigger is suspended; constraints and other business triggers remain.
-- The lock excludes concurrent writers until the migration transaction ends.
-- Any failure rolls back both this data change and the trigger state.
do $audit_backfill$
begin
  lock table public.romiku_quotes in share row exclusive mode;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.romiku_quotes'::regclass
      and tgname = 'romiku_audit' and tgenabled = 'O' and not tgisinternal
  ) then
    raise exception 'Expected enabled audit trigger before release backfill';
  end if;
  alter table public.romiku_quotes disable trigger romiku_audit;
update public.romiku_quotes set status=case status when 'draft' then 'pending_quote' when 'sent' then 'quoted' end where status in ('draft','sent');
  alter table public.romiku_quotes enable trigger romiku_audit;
end
$audit_backfill$;
alter table public.romiku_quotes alter column status set default 'pending_quote', add constraint romiku_quotes_status_check check(status in ('pending_quote','quoted','following_up','customer_no_reply','won','invalid'));
create or replace function public.romiku_normalize_workflow_status() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_table_name='romiku_quotes' and new.status='draft' then new.status:='pending_quote';
 elsif tg_table_name='romiku_quotes' and new.status='sent' then new.status:='quoted';
 elsif tg_table_name='romiku_production_orders' and new.status='pending' then new.status:='pending_send';
 elsif tg_table_name='romiku_production_orders' and new.status='in_production' then new.status:='scheduled';
 elsif tg_table_name='romiku_website_inquiries' and new.status='new' then new.status:='pending_screening'; end if;
 return new; end $$;

create or replace function public.romiku_batch_status(kind text,ids uuid[],target_status text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid; label text; success jsonb:='[]'; failed jsonb:='[]'; allowed text[];
begin
if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 条记录。'); end if;
 case kind
 when 'quote' then allowed:=array['pending_quote','quoted','following_up','customer_no_reply','won','invalid'];
 when 'pi' then allowed:=array['draft','sent','confirmed','cancelled'];
 when 'production' then allowed:=array['pending_send','scheduled','received','cancelled'];
 when 'packing' then allowed:=array['draft','incomplete','completed','sent'];
 when 'website_inquiry' then allowed:=array['pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply','won','invalid'];
 when 'outbound' then allowed:=array['to_develop','contacted','no_reply','replied','communicating','purchase_intent','to_quote','quoted','sampling','paused','invalid'];
 else return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','该类型不支持批量修改状态。'); end case;
 if target_status is null or not target_status=any(allowed) then return jsonb_build_object('ok',false,'code','INVALID_STATUS','message','不支持的目标状态。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  label:=null;
  begin
   select w.label into label from public.romiku_workflow_records w where w.kind=romiku_batch_status.kind and w.id=v;
   case kind
    when 'quote' then update public.romiku_quotes set status=target_status where id=v;
    when 'pi' then update public.romiku_pis set status=target_status where id=v;
    when 'production' then update public.romiku_production_orders set status=target_status where id=v;
    when 'packing' then update public.romiku_packing_lists set status=target_status where id=v;
    when 'website_inquiry' then update public.romiku_website_inquiries set status=target_status where id=v;
    when 'outbound' then update public.romiku_outbound_companies set status=target_status where id=v;
   end case;
   if not found then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'记录不存在'),'code','NOT_FOUND','message','记录不存在或无权操作。'));
   else success:=success||jsonb_build_array(jsonb_build_object('id',v,'label',label)); end if;
  exception when sqlstate 'P4201' then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'生产单'),'code','OVER_ALLOCATED','message',sqlerrm));
  when others then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'记录'),'code','UPDATE_FAILED','message','状态修改失败，记录未被更改。请刷新后重试。')); end;
 end loop;
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;
revoke all on function public.romiku_batch_status(text,uuid[],text) from public,anon;
grant execute on function public.romiku_batch_status(text,uuid[],text) to authenticated;

CREATE OR REPLACE FUNCTION "public"."romiku_submit_website_inquiry"("payload" "jsonb") RETURNS TABLE("id" "uuid", "document_number" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  field_name text;
  item jsonb;
  item_quantity numeric;
  inquiry_id uuid;
  inquiry_number text;
BEGIN
  -- SECURITY INVOKER: only service_role receives EXECUTE. Validate here too,
  -- so direct server RPC callers cannot bypass the HTTP boundary's checks.
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid inquiry payload' USING ERRCODE = '22023';
  END IF;
  FOREACH field_name IN ARRAY ARRAY['customerName','email','country','message'] LOOP
    IF jsonb_typeof(payload->field_name) IS DISTINCT FROM 'string'
       OR length(payload->>field_name) > (CASE field_name WHEN 'message' THEN 10000 WHEN 'email' THEN 320 WHEN 'customerName' THEN 200 ELSE 100 END)
       OR (field_name <> 'message' AND (payload->>field_name) !~ '[^[:space:]]') THEN
      RAISE EXCEPTION 'Invalid inquiry field: %', field_name USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (payload->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'whatsapp' AND payload->'whatsapp' <> 'null'::jsonb
     AND (jsonb_typeof(payload->'whatsapp') IS DISTINCT FROM 'string' OR length(payload->>'whatsapp') > 100) THEN
    RAISE EXCEPTION 'Invalid WhatsApp' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'company' AND (jsonb_typeof(payload->'company') IS DISTINCT FROM 'string' OR length(payload->>'company') > 200) THEN
    RAISE EXCEPTION 'Invalid company' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid inquiry items' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(payload->'items') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Expected 1 to 100 inquiry items' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
    IF jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item->'sku') IS DISTINCT FROM 'string'
       OR (item->>'sku') !~ '[^[:space:]]' OR length(item->>'sku') > 200
       OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item->'requirement') IS DISTINCT FROM 'string'
       OR length(item->>'requirement') > 10000 THEN
      RAISE EXCEPTION 'Invalid inquiry item' USING ERRCODE = '22023';
    END IF;
    item_quantity := (item->>'quantity')::numeric;
    IF item_quantity <= 0 OR item_quantity >= 100000000000000 OR round(item_quantity,4) <> item_quantity THEN
      RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.romiku_website_inquiries(customer_name,company,email,whatsapp,country,message,raw_payload,owner_id)
  VALUES(payload->>'customerName',payload->>'company',payload->>'email',nullif(btrim(payload->>'whatsapp', E' \t\n\r'),''),payload->>'country',payload->>'message',payload,NULL)
  RETURNING romiku_website_inquiries.id,romiku_website_inquiries.document_number INTO inquiry_id,inquiry_number;
  INSERT INTO public.romiku_website_inquiry_items(inquiry_id,sku,quantity,requirement,owner_id)
  SELECT inquiry_id,value->>'sku',(value->>'quantity')::numeric,value->>'requirement',NULL
  FROM jsonb_array_elements(payload->'items');
  RETURN QUERY SELECT inquiry_id,inquiry_number;
END;
$$;

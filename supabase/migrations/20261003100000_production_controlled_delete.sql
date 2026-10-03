create or replace function public.romiku_delete_record(kind text, record_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare pi_count int := 0; order_count int := 0; production_count int := 0; packing_count int := 0; payment_count int := 0; followup_count int := 0;
begin
  if auth.uid() is null or coalesce(nullif(current_setting('role', true), 'none'), session_user) <> 'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。','dependencies','{}'::jsonb); end if;
  if kind is null or kind not in ('quote','pi','order','packing','outbound','manual_task','production') then return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','不支持的删除类型。','dependencies','{}'::jsonb); end if;
  -- Lock the parent before checking dependencies. FK inserts take KEY SHARE,
  -- so concurrent downstream creation cannot slip past this delete.
  case kind
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
    select count(*) into production_count from public.romiku_production_orders where order_id=record_id; select count(*) into packing_count from public.romiku_packing_lists where order_id=record_id; select count(*) into payment_count from public.romiku_payments where order_id=record_id;
    if production_count+packing_count+payment_count>0 then return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM','message',format('该订单已有 %s 张生产单、%s 张装箱单、%s 条收款记录，无法删除。',production_count,packing_count,payment_count),'dependencies',jsonb_build_object('production',production_count,'packing',packing_count,'payments',payment_count)); end if;
    update public.romiku_manual_tasks set order_id=null where order_id=record_id; delete from public.romiku_order_items where order_id=record_id; delete from public.romiku_production_order_counters where order_id=record_id; delete from public.romiku_orders where id=record_id;
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
  elsif kind='outbound' then
    update public.romiku_formal_customers set source_outbound_company_id=null where source_outbound_company_id=record_id; update public.romiku_website_inquiries set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_quotes set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_pis set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_orders set outbound_company_id=null where outbound_company_id=record_id; update public.romiku_manual_tasks set outbound_company_id=null where outbound_company_id=record_id;
    delete from public.romiku_outbound_followups where outbound_company_id=record_id; delete from public.romiku_source_urls where outbound_company_id=record_id; delete from public.romiku_outbound_contacts where outbound_company_id=record_id; delete from public.romiku_outbound_companies where id=record_id;
  else delete from public.romiku_manual_tasks where id=record_id; end if;
  return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'code','DELETE_FAILED','message','删除失败，记录未被更改。请刷新后重试或联系管理员。','dependencies','{}'::jsonb); end;
$$;
revoke all on function public.romiku_delete_record(text,uuid) from public, anon;
grant execute on function public.romiku_delete_record(text,uuid) to authenticated;


revoke delete on public.romiku_production_orders from public, anon, authenticated;

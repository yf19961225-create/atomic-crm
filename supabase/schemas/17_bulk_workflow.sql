-- Shared resource labels are read under caller RLS; fixed union, no dynamic relation names.
create or replace view public.romiku_workflow_records with (security_invoker=true) as
select 'quote'::text kind,id,document_number label,status from public.romiku_quotes
union all
select 'pi'::text kind,id,document_number label,status from public.romiku_pis
union all
select 'order'::text kind,id,document_number label,status from public.romiku_orders
union all
select 'production'::text kind,id,document_number label,status from public.romiku_production_orders
union all
select 'packing'::text kind,id,document_number label,status from public.romiku_packing_lists
union all
select 'website_inquiry'::text kind,id,document_number label,status from public.romiku_website_inquiries
union all
select 'outbound'::text kind,id,name label,status from public.romiku_outbound_companies;
revoke all on public.romiku_workflow_records from public,anon;
grant select on public.romiku_workflow_records to authenticated,service_role;
create or replace function public.romiku_inquiry_dependencies(record_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('quotes',(select count(*) from public.romiku_quotes q where q.source_website_inquiry_id=record_id or exists(select 1 from public.romiku_quote_items qi join public.romiku_website_inquiry_items ii on ii.id=qi.source_website_inquiry_item_id where qi.quote_id=q.id and ii.inquiry_id=record_id)), 'pi',(select count(*) from public.romiku_pis where source_website_inquiry_id=record_id),'orders',(select count(*) from public.romiku_orders where source_website_inquiry_id=record_id),'formal_customers',(select count(*) from public.romiku_website_inquiries where id=record_id and formal_customer_id is not null));
$$;
revoke all on function public.romiku_inquiry_dependencies(uuid) from public,anon;
grant execute on function public.romiku_inquiry_dependencies(uuid) to authenticated;

create or replace function public.romiku_delete_preflight(kind text,ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v uuid; dep jsonb; reasons jsonb; policy jsonb; eligible jsonb:='[]'; blocked jsonb:='[]'; item jsonb;
begin
if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 条记录。'); end if;
 if kind not in ('quote','pi','order','production','packing','website_inquiry','outbound') or kind is null then return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','不支持的删除类型。'); end if;

 for v in select distinct unnest(ids) order by 1 loop
  select * into r from public.romiku_workflow_records w where w.kind=romiku_delete_preflight.kind and w.id=v;
  dep:='{}';reasons:='[]';
  if not found then
   item:=jsonb_build_object('id',v,'label','记录不存在','code','NOT_FOUND','reasons',jsonb_build_array('记录不存在。'));
   blocked:=blocked||jsonb_build_array(item);continue;
  end if;
  case kind
   when 'order' then
    policy:=public.romiku_order_delete_eligibility(v);reasons:=policy->'blocked_reasons';dep:=policy;
   when 'quote' then
    dep:=jsonb_build_object('pi',(select count(*) from public.romiku_pis where source_quote_id=v),'orders',(select count(*) from public.romiku_orders where source_quote_id=v));
    if (dep->>'pi')::int+(dep->>'orders')::int>0 then reasons:=jsonb_build_array(format('该报价单已有 %s 张 PI、%s 张订单，无法删除。',dep->>'pi',dep->>'orders')); end if;
   when 'pi' then
    dep:=jsonb_build_object('orders',(select count(*) from public.romiku_orders where source_pi_id=v));
    if (dep->>'orders')::int>0 then reasons:=jsonb_build_array(format('该 PI 已有 %s 张订单，无法删除。',dep->>'orders')); end if;
   when 'production' then
    dep:=jsonb_build_object('production_followups',(select count(*) from public.romiku_production_followups where production_order_id=v));
    if (dep->>'production_followups')::int>0 then reasons:=jsonb_build_array(format('该生产单已有 %s 条生产跟进记录，无法删除。',dep->>'production_followups')); end if;
   when 'website_inquiry' then
    dep:=public.romiku_inquiry_dependencies(v);
    if exists(select 1 from jsonb_each_text(dep) d where d.value::int>0) then reasons:=jsonb_build_array('该询盘已有正式客户或下游商业单据，无法删除。可根据实际情况标记为无效。'); end if;
   else null;
  end case;
  item:=jsonb_build_object('id',v,'label',r.label,'dependencies',dep,'reasons',reasons);
  if jsonb_array_length(reasons)>0 then blocked:=blocked||jsonb_build_array(item||jsonb_build_object('code','HAS_DOWNSTREAM')); else eligible:=eligible||jsonb_build_array(item); end if;
 end loop;
 return jsonb_build_object('ok',true,'deletable',eligible,'blocked',blocked);
end $$;
revoke all on function public.romiku_delete_preflight(text,uuid[]) from public,anon;
grant execute on function public.romiku_delete_preflight(text,uuid[]) to authenticated;
create or replace function public.romiku_batch_delete(kind text,ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; label text; outcome jsonb; success jsonb:='[]'; failed jsonb:='[]';
begin
if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 条记录。'); end if;
 if kind not in ('quote','pi','order','production','packing','website_inquiry','outbound') or kind is null then return jsonb_build_object('ok',false,'code','UNSUPPORTED_KIND','message','不支持的删除类型。'); end if;

 for v in select distinct unnest(ids) order by 1 loop
  select w.label into label from public.romiku_workflow_records w where w.kind=romiku_batch_delete.kind and w.id=v;
  outcome:=public.romiku_delete_record(kind,v)||jsonb_build_object('id',v,'label',coalesce(label,'记录不存在'));
  if outcome->>'ok'='true' then success:=success||jsonb_build_array(outcome);
  else failed:=failed||jsonb_build_array(outcome||jsonb_build_object('status',case when outcome->>'code'='HAS_DOWNSTREAM' then 'blocked_at_execution' else 'failed' end)); end if;
 end loop;
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;
revoke all on function public.romiku_batch_delete(text,uuid[]) from public,anon;
grant execute on function public.romiku_batch_delete(text,uuid[]) to authenticated;
create or replace function public.romiku_batch_status(kind text,ids uuid[],target_status text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid; label text; success jsonb:='[]'; failed jsonb:='[]'; allowed text[]; previous_source text;
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
 previous_source:=current_setting('romiku.status_change_source',true);
 perform set_config('romiku.status_change_source','batch',true);
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
 perform set_config('romiku.status_change_source',coalesce(previous_source,''),true);
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;
revoke all on function public.romiku_batch_status(text,uuid[],text) from public,anon;
grant execute on function public.romiku_batch_status(text,uuid[],text) to authenticated;

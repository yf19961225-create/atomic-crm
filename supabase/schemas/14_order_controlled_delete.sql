-- Internal policy: called only by the authenticated controlled-delete entry points.
create or replace function public.romiku_order_delete_eligibility(order_uuid uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.romiku_orders; p record; productions jsonb:='[]'; reasons jsonb:='[]'; pc int; payments int; packings int; label text;
begin
 select * into o from public.romiku_orders where id=order_uuid;
 if not found then return jsonb_build_object('order_id',order_uuid,'document_number','订单不存在','production_count',0,'packing_count',0,'payment_count',0,'delete_mode','blocked','cascade_productions','[]'::jsonb,'blocked_reasons',jsonb_build_array('订单不存在。'),'code','NOT_FOUND'); end if;
 select count(*) into packings from public.romiku_packing_lists where order_id=order_uuid;
 select count(*) into payments from public.romiku_payments where order_id=order_uuid;
 if packings>0 then reasons:=reasons||jsonb_build_array(format('已有 %s 张装箱单，无法删除。',packings)); end if;
 if payments>0 then reasons:=reasons||jsonb_build_array(format('已有 %s 条收款记录，无法删除。',payments)); end if;
 for p in select po.*, (select count(*) from public.romiku_production_followups f where f.production_order_id=po.id) followups from public.romiku_production_orders po where po.order_id=order_uuid order by po.document_number,po.id loop
  label:=case p.status when 'pending' then '待生产' when 'cancelled' then '已取消' when 'in_production' then '生产中' when 'completed' then '已完成' when 'received' then '已收货' else '非允许删除状态' end;
  productions:=productions||jsonb_build_array(jsonb_build_object('id',p.id,'document_number',p.document_number,'status',p.status,'status_label',label,'followup_count',p.followups,'archived',p.archived_at is not null));
  if p.archived_at is not null then reasons:=reasons||jsonb_build_array(format('%s 已归档，无法删除。',p.document_number)); end if;
  if p.status not in ('pending','cancelled') then reasons:=reasons||jsonb_build_array(format('%s 已处于%s，无法删除。',p.document_number,label)); end if;
  if p.followups>0 then reasons:=reasons||jsonb_build_array(format('%s 已有 %s 条生产跟进记录，无法删除。',p.document_number,p.followups)); end if;
 end loop;
 pc:=jsonb_array_length(productions);
 return jsonb_build_object('order_id',o.id,'document_number',o.document_number,'production_count',pc,'packing_count',packings,'payment_count',payments,'delete_mode',case when jsonb_array_length(reasons)>0 then 'blocked' when pc>0 then 'cascade_production' else 'order_only' end,'cascade_productions',productions,'blocked_reasons',reasons,'code',case when jsonb_array_length(reasons)>0 then 'HAS_DOWNSTREAM' else null end);
end $$;
revoke all on function public.romiku_order_delete_eligibility(uuid) from public,anon,authenticated;

create or replace function public.romiku_order_delete_preflight(ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; row_data jsonb; deletable jsonb:='[]'; blocked jsonb:='[]';
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 张订单。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  row_data:=public.romiku_order_delete_eligibility(v);
  if row_data->>'delete_mode'='blocked' then blocked:=blocked||jsonb_build_array(row_data); else deletable:=deletable||jsonb_build_array(row_data); end if;
 end loop;
 return jsonb_build_object('ok',true,'deletable',deletable,'blocked',blocked);
end $$;
revoke all on function public.romiku_order_delete_preflight(uuid[]) from public,anon;
grant execute on function public.romiku_order_delete_preflight(uuid[]) to authenticated;

create or replace function public.romiku_delete_order_controlled(order_uuid uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare policy jsonb; child record; outcome jsonb; message text;
begin
 -- FK inserts require KEY SHARE on these rows. Lock before the fresh policy read.
 perform 1 from public.romiku_orders where id=order_uuid for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','记录不存在。','dependencies','{}'::jsonb); end if;
 perform 1 from public.romiku_production_orders where order_id=order_uuid order by id for update;
 policy:=public.romiku_order_delete_eligibility(order_uuid);
 if policy->>'delete_mode'='blocked' then
  if (policy->>'packing_count')::int+(policy->>'payment_count')::int>0 then
   message:=format('该订单已有 %s 张生产单、%s 张装箱单、%s 条收款记录，无法删除。',policy->>'production_count',policy->>'packing_count',policy->>'payment_count');
  else select string_agg(value,' ') into message from jsonb_array_elements_text(policy->'blocked_reasons'); end if;
  return jsonb_build_object('ok',false,'code','HAS_DOWNSTREAM','message',message,'dependencies',jsonb_build_object('production',(policy->>'production_count')::int,'packing',(policy->>'packing_count')::int,'payments',(policy->>'payment_count')::int));
 end if;
 for child in select id from public.romiku_production_orders where order_id=order_uuid order by id loop
  outcome:=public.romiku_delete_record('production',child.id);
  -- A returned child failure MUST raise here so this exception block restores
  -- earlier children and task links, not just the child that failed.
  if outcome->>'ok' is distinct from 'true' then raise exception 'controlled child delete failed'; end if;
 end loop;
 update public.romiku_manual_tasks set order_id=null where order_id=order_uuid;
 delete from public.romiku_order_items where order_id=order_uuid;
 delete from public.romiku_orders where id=order_uuid;
 -- Numbering ledgers and barcode reservations deliberately survive the document.
 return jsonb_build_object('ok',true);
exception when others then
 return jsonb_build_object('ok',false,'code','DELETE_FAILED','message','删除失败，记录未被更改。请刷新后重试或联系管理员。','dependencies','{}'::jsonb);
end $$;
revoke all on function public.romiku_delete_order_controlled(uuid) from public,anon,authenticated;

create or replace function public.romiku_batch_delete_orders(ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid; label text; outcome jsonb; deleted jsonb:='[]'; failed jsonb:='[]';
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 张订单。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  select document_number into label from public.romiku_orders where id=v;
  outcome:=public.romiku_delete_record('order',v);
  outcome:=outcome||jsonb_build_object('order_id',v,'document_number',coalesce(label,'订单不存在'));
  if outcome->>'ok'='true' then deleted:=deleted||jsonb_build_array(outcome);
  else failed:=failed||jsonb_build_array(outcome||jsonb_build_object('status',case when outcome->>'code'='HAS_DOWNSTREAM' then 'blocked_at_execution' else 'failed' end)); end if;
 end loop;
 return jsonb_build_object('ok',true,'deleted',deleted,'failed',failed);
end $$;
revoke all on function public.romiku_batch_delete_orders(uuid[]) from public,anon;
grant execute on function public.romiku_batch_delete_orders(uuid[]) to authenticated;

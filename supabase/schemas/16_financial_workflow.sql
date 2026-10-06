create or replace function public.romiku_guard_financial_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='romiku_payments' then
  if tg_op='DELETE' then raise exception '收款历史不能永久删除。' using errcode='P4202'; end if;
  if tg_op='UPDATE' and (old.status='voided' or new.order_id is distinct from old.order_id) then raise exception '已作废收款不可更改；收款所属订单不可变更。' using errcode='P4202'; end if;
  if current_user='authenticated' and (new.status<>'active' or new.voided_at is not null or new.voided_by is not null or new.void_reason is not null or new.voided_by_label is not null) then raise exception '请使用作废收款操作。' using errcode='P4202'; end if;
 else
  if tg_op='INSERT' and (new.status='voided' or new.voided_at is not null or new.voided_by is not null or new.void_reason is not null) then raise exception '请使用作废订单操作。' using errcode='P4202'; end if;
  if tg_op='UPDATE' then
   if old.status='voided' and new.status is distinct from old.status then raise exception '已作废订单不能恢复。' using errcode='P4202'; end if;
   if current_user='authenticated' and (new.status='voided' and old.status<>'voided' or new.voided_at is distinct from old.voided_at or new.voided_by is distinct from old.voided_by or new.voided_by_label is distinct from old.voided_by_label or new.void_reason is distinct from old.void_reason) then raise exception '请使用作废订单操作。' using errcode='P4202'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger guard_payment_history before insert or update or delete on public.romiku_payments for each row execute function public.romiku_guard_financial_history();
create trigger guard_order_void before insert or update on public.romiku_orders for each row execute function public.romiku_guard_financial_history();
revoke delete on public.romiku_payments from authenticated,anon;
create or replace function public.romiku_void_payment(payment_id uuid,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.romiku_payments; actor text;
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if reason is null or length(btrim(reason)) not between 1 and 2000 then return jsonb_build_object('ok',false,'code','INVALID_REASON','message','请填写作废原因（最多 2000 字）。'); end if;
 select * into p from public.romiku_payments where id=payment_id for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','收款记录不存在。'); end if;
 if p.status='voided' then return jsonb_build_object('ok',false,'code','ALREADY_VOIDED','message','该收款已作废。'); end if;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(email,''),'已登录用户') into actor from auth.users where id=auth.uid();
 update public.romiku_payments set status='voided',voided_at=now(),voided_by=auth.uid(),voided_by_label=coalesce(actor,'已登录用户'),void_reason=btrim(reason) where id=payment_id;
 return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'code','UPDATE_FAILED','message','作废失败，收款记录未被更改。请刷新后重试。'); end $$;
revoke all on function public.romiku_void_payment(uuid,text) from public,anon;
grant execute on function public.romiku_void_payment(uuid,text) to authenticated;
create or replace function public.romiku_void_order(order_id uuid,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.romiku_orders; actor text;
begin
 if auth.uid() is null or coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','请先登录。'); end if;
 if reason is null or length(btrim(reason)) not between 1 and 2000 then return jsonb_build_object('ok',false,'code','INVALID_REASON','message','请填写作废原因（最多 2000 字）。'); end if;
 select * into o from public.romiku_orders where id=order_id for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','message','订单不存在。'); end if;
 if o.status='voided' then return jsonb_build_object('ok',false,'code','ALREADY_VOIDED','message','该订单已作废。'); end if;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(email,''),'已登录用户') into actor from auth.users where id=auth.uid();
 update public.romiku_orders set status='voided',voided_at=now(),voided_by=auth.uid(),voided_by_label=coalesce(actor,'已登录用户'),void_reason=btrim(reason) where id=order_id;
 return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'code','UPDATE_FAILED','message','作废失败，订单未被更改。请刷新后重试。'); end $$;
revoke all on function public.romiku_void_order(uuid,text) from public,anon;
grant execute on function public.romiku_void_order(uuid,text) to authenticated;
create or replace function public.romiku_archive_orders(ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid; label text; success jsonb:='[]'; failed jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if ids is null or cardinality(ids) not between 1 and 100 or array_position(ids,null) is not null then return jsonb_build_object('ok',false,'code','INVALID_ARGUMENT','message','请选择 1 至 100 张订单。'); end if;
 for v in select distinct unnest(ids) order by 1 loop
  begin
   update public.romiku_orders set archived_at=coalesce(archived_at,now()) where id=v returning document_number into label;
   if not found then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label','订单不存在','message','订单不存在或无权操作。'));
   else success:=success||jsonb_build_array(jsonb_build_object('id',v,'label',label)); end if;
  exception when others then failed:=failed||jsonb_build_array(jsonb_build_object('id',v,'label',coalesce(label,'订单'),'message','归档失败，请刷新后重试。')); end;
 end loop;
 return jsonb_build_object('ok',true,'succeeded',success,'failed',failed);
end $$;
revoke all on function public.romiku_archive_orders(uuid[]) from public,anon;
grant execute on function public.romiku_archive_orders(uuid[]) to authenticated;

revoke all on function public.romiku_guard_financial_history() from public,anon,authenticated;

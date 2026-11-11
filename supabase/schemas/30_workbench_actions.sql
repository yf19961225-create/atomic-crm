-- Controlled actions; all functions operate on the caller's visible records.
create function public.romiku_workbench_order_snapshot(p_order uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v jsonb; payments jsonb; s jsonb;
begin
 if not public.romiku_wb_visible('order',p_order) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select jsonb_build_object('total',o.total,'remaining',greatest(o.remaining_amount,0),
  'deposit_remaining',least(greatest(o.deposit_remaining,0),greatest(o.remaining_amount,0)),
  'currency',o.currency,'deposit_percent',o.deposit_percent,'status',o.status,'archived_at',o.archived_at)
 into v from public.romiku_order_totals o where o.id=p_order;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'kind',p.kind,
  'received_at',p.received_at,'status',p.status,'updated_at',p.updated_at,
  'proof_hash',encode(sha256(convert_to(jsonb_build_array(p.proof,p.payment_account,p.payment_reference)::text,'UTF8')),'hex')) order by p.id),'[]'::jsonb)
 into payments from public.romiku_payments p where p.order_id=p_order and p.status='active' and p.kind='deposit' and p.amount>0;
 select to_jsonb(c) into s from public.romiku_order_collection_state c where c.order_id=p_order;
 return jsonb_build_object('amounts',v,'payments',payments,'state',coalesce(s,jsonb_build_object('order_id',p_order,'customer_confirmation','unknown','deposit_override','none','revision',0)),
  'fingerprint',encode(sha256(convert_to(jsonb_build_array(v,payments)::text,'UTF8')),'hex'));
end $$;

create function public.romiku_workbench_action(p_action text,p_id uuid,p_revision bigint,p_request uuid,p_payload jsonb,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare entity text; prior public.romiku_workbench_requests; h text; oldstate jsonb; newstate jsonb;
 s public.romiku_order_collection_state; d public.romiku_production_due_state; snap jsonb;
 ev uuid:=gen_random_uuid(); result jsonb; parent uuid; actual_due timestamptz; next_due timestamptz; idx integer:=1;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'READ_COMMITTED_REQUIRED' using errcode='25001';
 end if;
 if p_action not in ('customer_confirmation','deposit_accept','deposit_revoke','collection_follow_up','production_due')
  or p_action is null or p_id is null or p_request is null or p_revision is null or p_revision<0
  or jsonb_typeof(p_payload) is distinct from 'object' or length(btrim(p_reason)) not between 1 and 2000 or p_reason is null
 then raise exception 'INVALID_ARGUMENT' using errcode='22023'; end if;
 entity:=case when p_action='production_due' then 'production' else 'order' end;
 if not public.romiku_wb_manage(entity,p_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_action,p_id,p_revision,p_payload,p_reason)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.romiku_workbench_requests where request_id=p_request;
 if found then
  if prior.actor_id is distinct from auth.uid() or prior.payload_hash<>h then raise exception 'REQUEST_CONFLICT' using errcode='PT409'; end if;
  return prior.result;
 end if;
 if entity='order' then
  perform 1 from public.romiku_orders where id=p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  insert into public.romiku_order_collection_state(order_id) values(p_id) on conflict do nothing;
  select * into s from public.romiku_order_collection_state where order_id=p_id for update;
  if s.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
  oldstate:=to_jsonb(s);
  if p_action='customer_confirmation' then
   if p_payload->>'state' not in ('unknown','unconfirmed','confirmed') or p_payload->>'state' is null then raise exception 'INVALID_STATE'; end if;
   s.customer_confirmation:=p_payload->>'state';
   if s.customer_confirmation<>'confirmed' and s.deposit_override='accepted' then s.deposit_override:='invalidated'; end if;
  elsif p_action='deposit_accept' then
   snap:=public.romiku_workbench_order_snapshot(p_id);
   if snap->>'fingerprint' is distinct from p_payload->>'fingerprint' then raise exception 'STALE_EVIDENCE' using errcode='PT409'; end if;
   if s.customer_confirmation<>'confirmed' or snap->'amounts'->>'status' in ('draft','voided','cancelled')
    or snap->'amounts'->>'archived_at' is not null or (snap->'amounts'->>'deposit_percent')::numeric not between 0.00001 and 99.99999
    or (snap->'amounts'->>'deposit_remaining')::numeric<=0 or jsonb_array_length(snap->'payments')=0 then raise exception 'DEPOSIT_NOT_ELIGIBLE' using errcode='23514'; end if;
   s.deposit_override:='accepted'; s.deposit_event_id:=ev;
  elsif p_action='deposit_revoke' then
   if s.deposit_override<>'accepted' then raise exception 'NO_ACTIVE_ACCEPTANCE' using errcode='23514'; end if;
   s.deposit_override:='revoked';
  else
   if jsonb_typeof(p_payload->'needs_follow_up') is distinct from 'boolean' then raise exception 'INVALID_FOLLOW_UP'; end if;
   s.needs_follow_up:=(p_payload->>'needs_follow_up')::boolean;
   s.next_follow_up_on:=(p_payload->>'next_follow_up_on')::date;
  end if;
  s.revision:=s.revision+1; s.updated_at:=clock_timestamp(); s.updated_by:=auth.uid(); newstate:=to_jsonb(s);
 else
  select order_id into parent from public.romiku_production_orders where id=p_id;
  perform 1 from public.romiku_orders where id=parent for update;
  select factory_due_at into actual_due from public.romiku_production_orders where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.romiku_production_due_state(production_order_id,due_classification)
   values(p_id,case when actual_due is null then 'unclassified' else 'confirmed' end) on conflict do nothing;
  select * into d from public.romiku_production_due_state where production_order_id=p_id for update;
  if d.revision<>p_revision then raise exception 'STALE_REVISION' using errcode='PT409'; end if;
  oldstate:=to_jsonb(d)||jsonb_build_object('factory_due_at',actual_due);
  if p_payload->>'classification' not in ('unclassified','needs_confirmation','confirmed','not_required') or p_payload->>'classification' is null then raise exception 'INVALID_STATE'; end if;
  if p_payload->>'date_mode'='keep' then next_due:=actual_due;
  elsif p_payload->>'date_mode'='clear' then next_due:=null;
  elsif p_payload->>'date_mode'='set' then
   if p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or p_payload->>'date' is null then raise exception 'INVALID_DATE'; end if;
   next_due:=(((p_payload->>'date')::date+1)::timestamp at time zone 'Asia/Shanghai')-interval '1 millisecond';
  else raise exception 'INVALID_DATE_MODE'; end if;
  d.due_classification:=p_payload->>'classification';
  if d.due_classification='confirmed' and next_due is null then raise exception 'DATE_REQUIRED' using errcode='23514'; end if;
  if d.due_classification='not_required' and next_due is not null and coalesce((p_payload->>'ack_retained_date')::boolean,false)=false then raise exception 'ACK_REQUIRED' using errcode='23514'; end if;
  if jsonb_typeof(p_payload->'needs_follow_up') is distinct from 'boolean' then raise exception 'INVALID_FOLLOW_UP'; end if;
  d.needs_follow_up:=(p_payload->>'needs_follow_up')::boolean; d.next_follow_up_on:=(p_payload->>'next_follow_up_on')::date;
  d.revision:=d.revision+1; d.updated_at:=clock_timestamp(); d.updated_by:=auth.uid();
  update public.romiku_production_orders set factory_due_at=next_due where id=p_id and factory_due_at is distinct from next_due;
  newstate:=to_jsonb(d)||jsonb_build_object('factory_due_at',next_due);
 end if;
 result:=jsonb_build_object('ok',true,'state',newstate,'event_id',ev,'request_id',p_request);
 insert into public.romiku_workbench_requests(request_id,actor_id,action,entity_type,entity_id,payload_hash,result)
 values(p_request,auth.uid(),p_action,entity,p_id,h,result);
 insert into public.romiku_workbench_events(id,request_id,event_index,entity_type,entity_id,action,actor_id,actor_source,before_state,after_state,evidence,reason,reverses_event_id)
 values(ev,p_request,idx,entity,p_id,p_action,auth.uid(),'user',oldstate,newstate,coalesce(snap,'{}'),p_reason,case when p_action='deposit_revoke' then (oldstate->>'deposit_event_id')::uuid else null end);
 if p_action='customer_confirmation' and oldstate->>'deposit_override'='accepted' and s.deposit_override='invalidated' then
  insert into public.romiku_workbench_events(request_id,event_index,entity_type,entity_id,action,actor_id,actor_source,before_state,after_state,reason)
  values(p_request,2,entity,p_id,'deposit_invalidated',auth.uid(),'user',oldstate,newstate,p_reason);
 end if;
 if entity='order' then
  update public.romiku_order_collection_state set customer_confirmation=s.customer_confirmation,deposit_override=s.deposit_override,deposit_event_id=s.deposit_event_id,
   needs_follow_up=s.needs_follow_up,next_follow_up_on=s.next_follow_up_on,revision=s.revision,updated_at=s.updated_at,updated_by=s.updated_by where order_id=p_id;
  if p_action='deposit_accept' then
   insert into public.romiku_deposit_evidence(event_id,payment_id) select ev,(value->>'id')::uuid from jsonb_array_elements(snap->'payments');
  end if;
 else
  update public.romiku_production_due_state set due_classification=d.due_classification,needs_follow_up=d.needs_follow_up,next_follow_up_on=d.next_follow_up_on,revision=d.revision,updated_at=d.updated_at,updated_by=d.updated_by where production_order_id=p_id;
 end if;
 return result;
end $$;

create function public.romiku_wb_invalidate(p_order uuid,p_source text,p_payment uuid default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare s public.romiku_order_collection_state; oldstate jsonb; req uuid:=gen_random_uuid();
begin
 perform 1 from public.romiku_orders where id=p_order for update;
 select * into s from public.romiku_order_collection_state where order_id=p_order for update;
 if not found or s.deposit_override<>'accepted' then return; end if;
 if p_payment is not null and not exists(select 1 from public.romiku_deposit_evidence where event_id=s.deposit_event_id and payment_id=p_payment) then return; end if;
 oldstate:=to_jsonb(s);
 update public.romiku_order_collection_state set deposit_override='invalidated',revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where order_id=p_order returning * into s;
 insert into public.romiku_workbench_requests(request_id,actor_id,action,entity_type,entity_id,payload_hash,result)
 values(req,auth.uid(),'invalidate','order',p_order,encode(sha256(convert_to(p_source,'UTF8')),'hex'),jsonb_build_object('state',to_jsonb(s)));
 insert into public.romiku_workbench_events(request_id,event_index,entity_type,entity_id,action,actor_id,actor_source,before_state,after_state,reason)
 values(req,1,'order',p_order,'deposit_invalidated',auth.uid(),case when auth.uid() is null then 'system' else 'user' end,oldstate,to_jsonb(s),p_source);
end $$;

create function public.romiku_wb_financial_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; item uuid;
begin
 if auth.uid() is not null and not public.romiku_wb_active() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if tg_table_name='romiku_payments' then
  if tg_op='UPDATE' and jsonb_build_array(new.amount,new.kind,new.received_at,new.status,new.proof,new.payment_account,new.payment_reference,new.order_id)
   is distinct from jsonb_build_array(old.amount,old.kind,old.received_at,old.status,old.proof,old.payment_account,old.payment_reference,old.order_id) then
   perform public.romiku_wb_invalidate(old.order_id,'payment_changed',old.id);
  elsif tg_op='DELETE' then perform public.romiku_wb_invalidate(old.order_id,'payment_deleted',old.id); end if;
 elsif tg_table_name='romiku_orders' then
  if jsonb_build_array(new.freight,new.discount,new.other_expenses,new.currency,new.deposit_percent)
   is distinct from jsonb_build_array(old.freight,old.discount,old.other_expenses,old.currency,old.deposit_percent)
   or (new.status in ('draft','cancelled','voided') and new.status is distinct from old.status)
   or (new.archived_at is not null and old.archived_at is null) then perform public.romiku_wb_invalidate(new.id,'order_terms_changed'); end if;
 else
  if tg_op='INSERT' then ids:=array[new.order_id];
  elsif tg_op='DELETE' then ids:=array[old.order_id];
  elsif jsonb_build_array(new.order_id,new.quantity,new.unit_price) is distinct from jsonb_build_array(old.order_id,old.quantity,old.unit_price) then ids:=array[old.order_id,new.order_id];
  else return new; end if;
  for item in select distinct u from unnest(ids) u order by u loop perform public.romiku_wb_invalidate(item,'order_item_changed'); end loop;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger wb_payment_change after update or delete on public.romiku_payments for each row execute function public.romiku_wb_financial_change();
create trigger wb_order_change after update on public.romiku_orders for each row execute function public.romiku_wb_financial_change();
create trigger wb_order_item_change after insert or update or delete on public.romiku_order_items for each row execute function public.romiku_wb_financial_change();

create function public.romiku_wb_due_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.factory_due_at is distinct from old.factory_due_at and current_user<>'romiku_workbench_executor' then
  raise exception '工厂交期已启用版本保护，请使用受控交期操作。' using errcode='42501';
 end if;
 return new;
end $$;
create trigger wb_due_guard before update of factory_due_at on public.romiku_production_orders for each row execute function public.romiku_wb_due_guard();

create function public.romiku_workbench_verification_list(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
 if not public.romiku_wb_active() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'INVALID_PAGE'; end if;
 with eligible as (
  select o.id,o.document_number,o.document_name,o.currency,o.remaining_amount,o.status,o.document_date
  from public.romiku_order_totals o left join public.romiku_order_collection_state s on s.order_id=o.id
  where coalesce(s.customer_confirmation,'unknown')='unknown' and o.remaining_amount>0 and o.archived_at is null and o.status not in ('cancelled','voided')
 ), page as (select * from eligible order by document_date desc nulls last,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by document_date desc nulls last,id) from page p),'[]'::jsonb),
  'potential_receivables',coalesce((select jsonb_agg(to_jsonb(t) order by currency) from (select currency,sum(remaining_amount) amount from eligible group by currency) t),'[]'::jsonb)) into r;
 return r;
end $$;

-- Ownership is changed only after granting temporary schema CREATE; revoked below.
grant create on schema public to romiku_workbench_executor;
alter function public.romiku_workbench_action(text,uuid,bigint,uuid,jsonb,text) owner to romiku_workbench_executor;
alter function public.romiku_wb_invalidate(uuid,text,uuid) owner to romiku_workbench_executor;
alter function public.romiku_wb_financial_change() owner to romiku_workbench_executor;
revoke create on schema public from romiku_workbench_executor;
revoke all on function public.romiku_workbench_action(text,uuid,bigint,uuid,jsonb,text),public.romiku_workbench_order_snapshot(uuid),public.romiku_workbench_verification_list(integer,integer),public.romiku_wb_invalidate(uuid,text,uuid),public.romiku_wb_financial_change(),public.romiku_wb_due_guard() from public,anon,authenticated;
grant execute on function public.romiku_workbench_action(text,uuid,bigint,uuid,jsonb,text),public.romiku_workbench_order_snapshot(uuid),public.romiku_workbench_verification_list(integer,integer) to authenticated;

create function public.romiku_workbench_receivables(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
 if not public.romiku_wb_active() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'INVALID_PAGE'; end if;
 with eligible as (
 select o.id,o.document_number,o.document_name,o.currency,o.remaining_amount,
 case when o.deposit_percent=100 then 'prepayment' when s.deposit_override<>'accepted' and o.deposit_remaining>0 then 'deposit' else 'balance' end phase,
 case when o.deposit_percent<100 and s.deposit_override<>'accepted' and o.deposit_remaining>0 then least(o.deposit_remaining,o.remaining_amount) else o.remaining_amount end amount,
 s.revision,s.needs_follow_up,s.next_follow_up_on
 from public.romiku_order_totals o join public.romiku_order_collection_state s on s.order_id=o.id
 where s.customer_confirmation='confirmed' and o.status not in ('draft','cancelled','voided') and o.archived_at is null and o.remaining_amount>0
 ), page as (select * from eligible order by needs_follow_up desc,next_follow_up_on nulls last,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by needs_follow_up desc,next_follow_up_on nulls last,id) from page p),'[]'::jsonb)) into r;
 return r;
end $$;
revoke all on function public.romiku_workbench_receivables(integer,integer) from public,anon;
grant execute on function public.romiku_workbench_receivables(integer,integer) to authenticated;

create function public.romiku_wb_source_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; req uuid:=gen_random_uuid();
begin
 if auth.uid() is not null and not public.romiku_wb_active() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 kind:=case when tg_table_name='romiku_orders' then 'order' else 'production' end;
 insert into public.romiku_workbench_requests(request_id,actor_id,action,entity_type,entity_id,payload_hash,result)
 values(req,auth.uid(),'source_deleted',kind,old.id,encode(sha256(convert_to(old.id::text,'UTF8')),'hex'),jsonb_build_object('deleted',true));
 insert into public.romiku_workbench_events(request_id,event_index,entity_type,entity_id,action,actor_id,actor_source,before_state,after_state,reason)
 values(req,1,kind,old.id,'source_deleted',auth.uid(),case when auth.uid() is null then 'system' else 'user' end,jsonb_build_object('id',old.id),'{}','Existing controlled source deletion');
 return old;
end $$;
grant create on schema public to romiku_workbench_executor;
alter function public.romiku_wb_source_deleted() owner to romiku_workbench_executor;
revoke create on schema public from romiku_workbench_executor;
revoke all on function public.romiku_wb_source_deleted() from public,anon,authenticated;
create trigger wb_order_deleted before delete on public.romiku_orders for each row execute function public.romiku_wb_source_deleted();
create trigger wb_production_deleted before delete on public.romiku_production_orders for each row execute function public.romiku_wb_source_deleted();

-- One statement snapshot: full RLS-visible grouping/counts precede pagination.
create function public.romiku_workbench_feed(p_tab text default 'recent',p_search text default '',p_kind text default '',p_status text default '',p_limit integer default 8,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.romiku_wb_active() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or p_tab not in ('recent','collection','arrange','all') then raise exception 'INVALID_PAGE'; end if;
 with orders as (
  select o.*,coalesce(s.customer_confirmation,'unknown') cc,coalesce(s.deposit_override,'none') override,
   coalesce(s.needs_follow_up,false) needs_follow_up,s.next_follow_up_on,coalesce(s.revision,0) revision
  from public.romiku_order_totals o left join public.romiku_order_collection_state s on s.order_id=o.id
  where o.archived_at is null and o.status not in ('cancelled','voided')
 ), cash as (
  select o.*,case when deposit_percent=100 then 'prepayment' when override<>'accepted' and deposit_remaining>0 then 'deposit' else 'balance' end phase
  from orders o where cc='confirmed' and status<>'draft' and remaining_amount>0
 ), children as (
  select p.id,p.order_id,p.document_number,p.status,p.factory_due_at,
   coalesce(s.due_classification,case when p.factory_due_at is null then 'unclassified' else 'confirmed' end) classification,
   coalesce(s.revision,0) revision,coalesce(s.needs_follow_up,false) needs_follow_up,s.next_follow_up_on
  from public.romiku_production_orders p left join public.romiku_production_due_state s on s.production_order_id=p.id
  where p.archived_at is null and p.status not in ('received','cancelled')
 ), groups as (
  select o.id,o.document_number,o.document_name,count(*) child_count,
   least(min((c.factory_due_at at time zone 'Asia/Shanghai')::date) filter(where c.classification='confirmed'),min(c.next_follow_up_on)) due,
   count(*) filter(where c.classification in ('unclassified','needs_confirmation')) arrange_count,
   bool_or(c.needs_follow_up or c.next_follow_up_on<=(now() at time zone 'Asia/Shanghai')::date) urgent,
   jsonb_agg(to_jsonb(c) order by c.document_number,c.id) children
  from children c join orders o on o.id=c.order_id group by o.id,o.document_number,o.document_name
 ), tasks as (
  select 'collection:'||c.id id,'collection'::text kind,'romiku_orders'::text source_table,c.id source_id,
   coalesce(nullif(c.document_name,''),c.document_number) title,c.document_number,c.phase status,
   least(c.next_follow_up_on,(case when phase in ('deposit','prepayment') then deposit_due_at else balance_due_at end at time zone 'Asia/Shanghai')::date) due,
   (c.needs_follow_up or coalesce(c.next_follow_up_on<=(now() at time zone 'Asia/Shanghai')::date,false) or coalesce((case when phase in ('deposit','prepayment') then deposit_due_at else balance_due_at end at time zone 'Asia/Shanghai')::date < (now() at time zone 'Asia/Shanghai')::date,false)) urgent,false arrange,
   jsonb_build_object('amount',case when phase='deposit' then least(deposit_remaining,remaining_amount) else remaining_amount end,'currency',currency,'revision',revision) extra
  from cash c
  union all
  select 'verification:'||o.id,'verification','romiku_orders',o.id,coalesce(nullif(document_name,''),document_number),document_number,cc,null::date,false,true,
   jsonb_build_object('amount',remaining_amount,'currency',currency,'revision',revision)
  from orders o where cc='unknown' and remaining_amount>0
  union all
  select 'deferred:'||o.id,'deferred','romiku_orders',o.id,coalesce(nullif(document_name,''),document_number),document_number,case when status='draft' then 'draft' else cc end,null::date,false,false,
   jsonb_build_object('amount',remaining_amount,'currency',currency,'revision',revision)
  from orders o where remaining_amount>0 and cc<>'unknown' and (cc='unconfirmed' or status='draft')
  union all
  select 'production:'||g.id,'production','romiku_orders',g.id,coalesce(nullif(document_name,''),document_number),document_number,
   case when arrange_count>0 then 'needs_action' else 'scheduled' end,due,urgent,arrange_count>0,
   jsonb_build_object('child_count',child_count,'children',children,'arrange_count',arrange_count)
  from groups g
  union all
  select 'inquiry:'||i.id,'inquiry','romiku_website_inquiries',i.id,i.document_number,i.document_number,i.status,(i.next_follow_up_at at time zone 'Asia/Shanghai')::date,i.status='pending_screening',i.next_follow_up_at is null,'{}'::jsonb
  from public.romiku_website_inquiries i where i.archived_at is null and i.status in ('pending_screening','pending_contact','pending_quote','quoted','following_up','customer_no_reply')
  union all
  select 'quote:'||q.id,'quote','romiku_quotes',q.id,coalesce(nullif(q.document_name,''),q.document_number),q.document_number,q.status,(least(q.follow_up_at,q.due_at) at time zone 'Asia/Shanghai')::date,false,q.follow_up_at is null and q.due_at is null,'{}'
  from public.romiku_quotes q where q.archived_at is null and q.status in ('pending_quote','sent')
  union all
  select 'pi:'||q.id,'pi','romiku_pis',q.id,coalesce(nullif(q.document_name,''),q.document_number),q.document_number,q.status,(least(q.follow_up_at,q.due_at) at time zone 'Asia/Shanghai')::date,false,q.follow_up_at is null and q.due_at is null,'{}'
  from public.romiku_pis q where q.archived_at is null and q.status in ('draft','sent')
  union all
  select 'packing:'||p.id,'packing','romiku_packing_lists',p.id,p.document_number,p.document_number,p.status,(p.packing_at at time zone 'Asia/Shanghai')::date,false,p.packing_at is null,'{}'
  from public.romiku_packing_lists p where p.archived_at is null
  union all
  select 'task:'||t.id,'task','romiku_manual_tasks',t.id,t.title,null,'pending',(t.due_at at time zone 'Asia/Shanghai')::date,t.priority in ('urgent','high'),t.due_at is null,'{}'
  from public.romiku_manual_tasks t where t.completed_at is null
  union all
  select e.id,e.event_type,e.source_table,e.source_id,e.title,null,e.status,(e.due_at at time zone 'Asia/Shanghai')::date,e.event_type='production_anomaly',false,'{}'
  from public.romiku_workbench e where e.event_type in ('outbound_follow_up','order_delivery','production_anomaly') and (e.event_type<>'order_delivery' or e.status in ('confirmed','in_production','ready_to_ship'))
 ), classified as (
  select t.*, (urgent or kind<>'collection' and due < (now() at time zone 'Asia/Shanghai')::date+7) and kind not in ('verification','deferred') recent
  from tasks t
 ), filtered as (
  select * from classified t where
   (p_tab='all' or p_tab='recent' and recent or p_tab='collection' and kind='collection' or p_tab='arrange' and arrange)
   and (coalesce(p_kind,'')='' or kind=p_kind) and (coalesce(p_status,'')='' or status=p_status)
   and (coalesce(p_search,'')='' or strpos(lower(coalesce(title,'')||' '||coalesce(document_number,'')),lower(p_search))>0)
 ), page as (
  select * from filtered order by case when due < (now() at time zone 'Asia/Shanghai')::date then 0 when urgent then 1 else 2 end,due nulls last,id limit p_limit offset p_offset
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg((to_jsonb(p)-'extra')||p.extra order by case when due < (now() at time zone 'Asia/Shanghai')::date then 0 when urgent then 1 else 2 end,due nulls last,id) from page p),'[]'),
  'total',(select count(*) from filtered),'counts',jsonb_build_object('all',(select count(*) from classified),'recent',(select count(*) from classified where recent),'collection',(select count(*) from classified where kind='collection'),'arrange',(select count(*) from classified where arrange)),
  'unknown_total',(select count(*) from orders where cc='unknown' and remaining_amount>0),
  'potential_receivables',coalesce((select jsonb_agg(to_jsonb(v) order by currency) from (select currency,sum(remaining_amount) amount from orders where cc='unknown' and remaining_amount>0 group by currency) v),'[]'),
  'raw_count',(select coalesce(sum(case when kind='production' then (extra->>'child_count')::int else 1 end),0) from classified)) into result;
 return result;
end $$;
revoke all on function public.romiku_workbench_feed(text,text,text,text,integer,integer) from public,anon;
grant execute on function public.romiku_workbench_feed(text,text,text,text,integer,integer) to authenticated;

create function public.romiku_workbench_due_snapshot(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.romiku_wb_visible('production',p_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select jsonb_build_object('id',p.id,'document_number',p.document_number,'factory_due_at',p.factory_due_at,'classification',coalesce(s.due_classification,case when p.factory_due_at is null then 'unclassified' else 'confirmed' end),'revision',coalesce(s.revision,0),'needs_follow_up',coalesce(s.needs_follow_up,false),'next_follow_up_on',s.next_follow_up_on) into result
 from public.romiku_production_orders p left join public.romiku_production_due_state s on s.production_order_id=p.id where p.id=p_id;
 return result;
end $$;
revoke all on function public.romiku_workbench_due_snapshot(uuid) from public,anon;
grant execute on function public.romiku_workbench_due_snapshot(uuid) to authenticated;

-- Refresh notifications only; RLS and controlled RPC remain the authorization boundary.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['romiku_order_collection_state','romiku_production_due_state'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;

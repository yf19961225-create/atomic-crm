-- Incremental fix: business conflicts must not use retryable serialization failures.
-- Execute with ledger insertion in ONE transaction as postgres. No data/ACL changes.
-- M1/M2 are immutable. Existing clients recognize STALE/CONFLICT messages.
DO $definition_gate$
BEGIN
 if (select md5(prosrc) from pg_proc where oid='public.romiku_workbench_action(text,uuid,bigint,uuid,jsonb,text)'::regprocedure) <> 'e74aaf6de73d67b663065e4396bb656c'
 or (select pg_get_userbyid(proowner) from pg_proc where oid='public.romiku_workbench_action(text,uuid,bigint,uuid,jsonb,text)'::regprocedure) <> 'romiku_workbench_executor' then
  raise exception 'WORKBENCH_ACTION_DEFINITION_DRIFT';
 end if;
END $definition_gate$;
DO $ownership_gate$
BEGIN
 if current_user <> 'postgres' or session_user <> 'postgres' then
  raise exception 'WORKBENCH_MIGRATION_EXECUTOR_MISMATCH';
 end if;
 if pg_has_role('postgres','romiku_workbench_executor','SET')
    or pg_has_role('postgres','romiku_workbench_executor','USAGE')
    or has_schema_privilege('romiku_workbench_executor','public','CREATE')
    or exists(select 1 from pg_auth_members where roleid='romiku_workbench_executor'::regrole
      and member='postgres'::regrole and grantor='postgres'::regrole) then
  raise exception 'WORKBENCH_TEMPORARY_PRIVILEGE_BASELINE_CHANGED';
 end if;
END $ownership_gate$;
grant romiku_workbench_executor to postgres with admin false, inherit false, set true granted by postgres;
grant create on schema public to romiku_workbench_executor;
set local role romiku_workbench_executor;
create or replace function public.romiku_workbench_action(p_action text,p_id uuid,p_revision bigint,p_request uuid,p_payload jsonb,p_reason text) returns jsonb
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

reset role;
revoke create on schema public from romiku_workbench_executor;
revoke romiku_workbench_executor from postgres granted by postgres;
DO $ownership_verified$
BEGIN
 if pg_has_role('postgres','romiku_workbench_executor','SET')
    or pg_has_role('postgres','romiku_workbench_executor','USAGE')
    or has_schema_privilege('romiku_workbench_executor','public','CREATE')
    or exists(select 1 from pg_auth_members where roleid='romiku_workbench_executor'::regrole
      and member='postgres'::regrole and grantor='postgres'::regrole) then
  raise exception 'WORKBENCH_TEMPORARY_PRIVILEGE_NOT_REVOKED';
 end if;
END $ownership_verified$;

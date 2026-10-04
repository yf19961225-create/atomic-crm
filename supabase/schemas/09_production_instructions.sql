-- Preview-only rollout: Order saved defaults and CRM-only item overrides.
create or replace function public.romiku_valid_instruction_labels(value jsonb) returns boolean
language sql immutable parallel safe set search_path='' as $$
 select case when jsonb_typeof(value) <> 'array' or value is null then false else not exists (
 select 1 from jsonb_array_elements(value) l where jsonb_typeof(l)<>'object'
 or coalesce(l->>'mode','text') not in ('image','text','none')
 or (l ? 'text' and jsonb_typeof(l->'text') <> 'string')
 or (l->>'mode'='image' and (coalesce(l#>>'{image_asset,bucket}','')<>'romiku-marking-assets' or coalesce(l#>>'{image_asset,path}','') !~ '^[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$'))
 ) end
$$;
create or replace function public.romiku_valid_item_marking(value jsonb) returns boolean
language sql immutable parallel safe set search_path='' as $$
 select coalesce(jsonb_typeof(value)='object' and value->>'mode' in ('inherit','append','replace')
 and public.romiku_valid_instruction_labels(coalesce(value->'labels','[]'))
 and public.romiku_valid_instruction_labels(jsonb_build_array(coalesce(value->'front_mark','{"mode":"none"}'),coalesce(value->'side_mark','{"mode":"none"}')))
 and (not value ? 'notes' or jsonb_typeof(value->'notes')='string')
 and (not value ? 'labeling_requirements' or jsonb_typeof(value->'labeling_requirements')='string'),false)
$$;
create or replace function public.romiku_build_instruction_snapshot(profile jsonb, requirements text, source_kind text, source_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('version',1,'schema_version',2,'initialized_at',now(),
 'source',jsonb_strip_nulls(jsonb_build_object('kind',source_kind,'id',source_id,'copied_at',now())),
 'front_mark',coalesce(profile->'front_mark','{"mode":"none","text":"","image_asset":null}'),
 'side_mark',coalesce(profile->'side_mark','{"mode":"none","text":"","image_asset":null}'),
 'small_label',coalesce(profile->'small_label','{"mode":"none","text":"","image_asset":null}'),
 'additional_labels',coalesce(profile->'additional_labels','[]'),
 'labeling_requirements',coalesce(profile->>'labeling_requirements',''),
 'production_requirements',coalesce(requirements,''),'notes',coalesce(profile->>'notes',''))
$$;
alter table public.romiku_orders add column production_defaults_snapshot jsonb;
alter table public.romiku_production_items add column marking_override jsonb not null default '{"mode":"inherit"}'
 check (public.romiku_valid_item_marking(marking_override));
-- Never join current customer master data when initializing historical Orders.
update public.romiku_orders o set production_defaults_snapshot=public.romiku_build_instruction_snapshot(
 coalesce(o.counterparty_snapshot->'marking_snapshot','{}'),
 concat_ws(E'\n',nullif(o.terms_snapshot->>'production_requirements',''),nullif(o.counterparty_snapshot#>>'{marking_snapshot,production_requirements}',''),nullif(o.notes,'')),
 'legacy_order',o.id);
alter table public.romiku_orders alter column production_defaults_snapshot set not null;
alter table public.romiku_orders add constraint romiku_order_instructions_shape check (
 coalesce(jsonb_typeof(production_defaults_snapshot)='object'
 and production_defaults_snapshot->>'schema_version'='2'
 and coalesce(jsonb_typeof(production_defaults_snapshot->'initialized_at')='string',false)
 and coalesce(jsonb_typeof(production_defaults_snapshot->'source')='object',false)
 and length(production_defaults_snapshot->>'initialized_at')>0
 and length(production_defaults_snapshot#>>'{source,kind}')>0
 and public.romiku_valid_instruction_labels(coalesce(production_defaults_snapshot->'additional_labels','[]')),false));
create or replace function public.romiku_initialize_order_instructions() returns trigger
language plpgsql set search_path='' as $$
declare profile jsonb := '{}'; legacy jsonb; kind text := 'manual';
begin
 if new.production_defaults_snapshot is not null then return new; end if;
 if new.formal_customer_id is not null then
  select c.marking_profile,c.requirements into profile,legacy from public.romiku_formal_customers c where c.id=new.formal_customer_id;
  if found then
   kind := 'customer';
   if profile='{}' then profile := jsonb_build_object('front_mark',jsonb_build_object('text',legacy->>'shipping_marks'),'small_label',jsonb_build_object('text',legacy->>'product_labels'),'production_requirements',legacy->>'packaging'); end if;
  else raise exception '无法读取订单客户的生产默认值。' using errcode='42501'; end if;
 end if;
 new.production_defaults_snapshot := public.romiku_build_instruction_snapshot(coalesce(profile,'{}'),
  concat_ws(E'\n',nullif(new.terms_snapshot->>'production_requirements',''),nullif(new.notes,''),nullif(profile->>'production_requirements','')),kind,new.formal_customer_id);
 return new;
end
$$;
create trigger romiku_order_initialize_instructions before insert on public.romiku_orders for each row execute function public.romiku_initialize_order_instructions();

create or replace function public.romiku_update_item_marking(production_id uuid, item_ids uuid[], action text, payload jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare found_count integer; wanted integer;
begin
 if auth.uid() is null then raise exception '请先登录。' using errcode='42501'; end if;
 if action not in ('set','add','reset') or action is null then raise exception '不支持此标签操作。' using errcode='23514'; end if;
 wanted := coalesce(cardinality(item_ids),0);
 if wanted=0 or wanted>1000 or wanted<>(select count(distinct id) from unnest(item_ids) id) then raise exception '请选择有效且不重复的产品项。' using errcode='23514'; end if;
 perform 1 from public.romiku_production_orders where id=production_id for update;
 if not found then raise exception '生产单不存在或无权访问。' using errcode='42501'; end if;
 perform 1 from public.romiku_production_items where production_order_id=production_id and id=any(item_ids) for update;
 get diagnostics found_count=row_count;
 if found_count<>wanted then raise exception '所有产品项必须属于当前生产单且可访问。' using errcode='23514'; end if;
 if action='set' and not public.romiku_valid_item_marking(payload) then raise exception '标签例外格式无效。' using errcode='23514'; end if;
 if action='add' and (not public.romiku_valid_instruction_labels(payload->'labels') or jsonb_array_length(payload->'labels')=0) then raise exception '请添加有效标签。' using errcode='23514'; end if;
 update public.romiku_production_items set marking_override=case action
  when 'reset' then '{"mode":"inherit"}'::jsonb
  when 'set' then case when payload->>'mode'='inherit' then '{"mode":"inherit"}'::jsonb else payload end
  else (case when marking_override->>'mode'='inherit' then '{"mode":"inherit"}'::jsonb else marking_override end) || jsonb_build_object('mode',case when marking_override->>'mode'='replace' then 'replace' else 'append' end,
   'labels',(case when marking_override->>'mode'='inherit' then '[]'::jsonb else coalesce(marking_override->'labels','[]') end) || (payload->'labels')) end
 where production_order_id=production_id and id=any(item_ids);
 get diagnostics found_count=row_count;
 if found_count<>wanted then raise exception '部分产品项不可修改，整批操作已取消。' using errcode='42501'; end if;
 return found_count;
end
$$;
create or replace function public.romiku_reload_production_defaults(production_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare source_id uuid; saved jsonb; result jsonb;
begin
 if auth.uid() is null then raise exception '请先登录。' using errcode='42501'; end if;
 select order_id into source_id from public.romiku_production_orders where id=production_id for update;
 if not found then raise exception '生产单不存在或无权访问。' using errcode='42501'; end if;
 select production_defaults_snapshot into saved from public.romiku_orders where id=source_id;
 if not found then raise exception '无法读取来源订单。' using errcode='42501'; end if;
 result := saved || jsonb_build_object('initialized_at',now(),'source',jsonb_build_object('kind','order','id',source_id,'copied_at',now()));
 update public.romiku_production_orders set marking_snapshot=result where id=production_id;
 if not found then raise exception '无权修改生产单。' using errcode='42501'; end if;
 return result;
end
$$;
revoke all on function public.romiku_valid_instruction_labels(jsonb),public.romiku_valid_item_marking(jsonb),public.romiku_build_instruction_snapshot(jsonb,text,text,uuid),public.romiku_initialize_order_instructions(),public.romiku_update_item_marking(uuid,uuid[],text,jsonb),public.romiku_reload_production_defaults(uuid) from public,anon;
grant execute on function public.romiku_valid_instruction_labels(jsonb),public.romiku_valid_item_marking(jsonb),public.romiku_build_instruction_snapshot(jsonb,text,text,uuid),public.romiku_initialize_order_instructions(),public.romiku_update_item_marking(uuid,uuid[],text,jsonb),public.romiku_reload_production_defaults(uuid) to authenticated,service_role;

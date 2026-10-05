-- Additive validation only: no historical snapshot rows are rewritten.
create or replace function public.romiku_valid_item_marking_fields(value jsonb) returns boolean
language plpgsql immutable parallel safe set search_path='' as $$
declare key text; f jsonb; m jsonb; a jsonb; k text;
begin
 if jsonb_typeof(value)<>'object' or value is null then return false; end if;
 for key,f in select * from jsonb_each(value) loop
  if key not in ('front_mark','side_mark','small_label','labeling_requirements') or jsonb_typeof(f)<>'object' then return false; end if;
  for k in select jsonb_object_keys(f) loop
   if k not in ('mode',case when key='labeling_requirements' then 'text' else 'mark' end) then return false; end if;
  end loop;
  if key='labeling_requirements' then
   if coalesce(f->>'mode','') not in ('inherit','append','replace','none') or (f ? 'text' and jsonb_typeof(f->'text')<>'string') then return false; end if;
  else
   if coalesce(f->>'mode','') not in ('inherit','override','none') then return false; end if;
   if f->>'mode'='override' or f ? 'mark' then
    m:=f->'mark';
    if coalesce(jsonb_typeof(m),'')<>'object' or coalesce(m->>'mode','') not in ('text','image') then return false; end if;
    for k in select jsonb_object_keys(m) loop
     if k not in ('mode','text','image_asset') then return false; end if;
    end loop;
    if m ? 'text' and jsonb_typeof(m->'text')<>'string' then return false; end if;
    if m->>'mode'='text' and coalesce(jsonb_typeof(m->'text'),'')<>'string' then return false; end if;
    a:=m->'image_asset';
    if m->>'mode'='image' or (a is not null and a<>'null'::jsonb) then
     if coalesce(jsonb_typeof(a),'')<>'object' or coalesce(a->>'bucket','')<>'romiku-marking-assets'
      or coalesce(a->>'path','') !~ '^[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$' or position('..' in a->>'path')>0 then return false; end if;
     for k in select jsonb_object_keys(a) loop
      if k not in ('bucket','path','name','mime_type','size') then return false; end if;
     end loop;
    end if;
   end if;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.romiku_valid_item_marking_fields(jsonb) from public,anon;
grant execute on function public.romiku_valid_item_marking_fields(jsonb) to authenticated,service_role;

create or replace function public.romiku_valid_item_marking(value jsonb) returns boolean
language sql immutable parallel safe set search_path='' as $$
 select coalesce(jsonb_typeof(value)='object' and value->>'mode' in ('inherit','append','replace')
 and public.romiku_valid_instruction_labels(coalesce(value->'labels','[]'))
 and public.romiku_valid_instruction_labels(jsonb_build_array(coalesce(value->'front_mark','{"mode":"none"}'),coalesce(value->'side_mark','{"mode":"none"}')))
 and (not value ? 'notes' or jsonb_typeof(value->'notes')='string')
 and (not value ? 'labeling_requirements' or jsonb_typeof(value->'labeling_requirements')='string')
 and (not value ? 'field_overrides' or public.romiku_valid_item_marking_fields(value->'field_overrides'))
 and (not value ? 'additional_labels' or public.romiku_valid_instruction_labels(value->'additional_labels')),false)
$$;
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
  when 'set' then case when payload->>'mode'='inherit' and not (payload ? 'field_overrides' or payload ? 'additional_labels') then '{"mode":"inherit"}'::jsonb else payload end
  else (case when marking_override->>'mode'='inherit' then '{"mode":"inherit"}'::jsonb || jsonb_strip_nulls(jsonb_build_object('field_overrides',marking_override->'field_overrides','additional_labels',marking_override->'additional_labels','notes',case when marking_override ? 'field_overrides' then marking_override->'notes' end)) else marking_override end) || jsonb_build_object('mode',case when marking_override->>'mode'='replace' then 'replace' else 'append' end,
   'labels',(case when marking_override->>'mode'='inherit' then '[]'::jsonb else coalesce(marking_override->'labels','[]') end) || (payload->'labels')) end
 where production_order_id=production_id and id=any(item_ids);
 get diagnostics found_count=row_count;
 if found_count<>wanted then raise exception '部分产品项不可修改，整批操作已取消。' using errcode='42501'; end if;
 return found_count;
end
$$;

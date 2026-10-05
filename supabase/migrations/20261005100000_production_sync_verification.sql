-- Only effective shared content counts; initialization metadata and hidden text do not.
create or replace function public.romiku_has_production_instructions(value jsonb)
returns boolean language sql immutable parallel safe set search_path='' as $$
 select coalesce(
  exists (select 1 from jsonb_array_elements(
   jsonb_build_array(value->'front_mark',value->'side_mark',value->'small_label') ||
   case when jsonb_typeof(value->'additional_labels')='array' then value->'additional_labels' else '[]'::jsonb end
  ) m where
   (coalesce(m->>'mode',case when m#>>'{image_asset,path}' is not null then 'image' else 'text' end)='text'
    and jsonb_typeof(m->'text')='string' and btrim(m->>'text',E' \t\n\r')<>'')
   or (coalesce(m->>'mode','image')='image' and m#>>'{image_asset,bucket}'='romiku-marking-assets'
    and m#>>'{image_asset,path}' ~ '^[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$'
    and position('..' in m#>>'{image_asset,path}')=0)
  ) or exists (select 1 from unnest(array['labeling_requirements','production_requirements','notes']) k
    where jsonb_typeof(value->k)='string' and btrim(value->>k,E' \t\n\r')<>''),false)
$$;
revoke all on function public.romiku_has_production_instructions(jsonb) from public,anon;
grant execute on function public.romiku_has_production_instructions(jsonb) to authenticated,service_role;

create or replace function public.romiku_sync_order_production_defaults(source_order_id uuid, expected jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.romiku_orders%rowtype; rows jsonb; token text; n integer; saved jsonb; verified integer;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','请先登录。'); end if;
 select * into o from public.romiku_orders where id=source_order_id for update;
 if not found then return jsonb_build_object('ok',false,'message','无法读取所属订单。'); end if;
 if not public.romiku_has_production_instructions(o.production_defaults_snapshot) then
  return jsonb_build_object('ok',false,'code','EMPTY_DEFAULTS','message','当前订单尚未设置统一生产要求，请先设置订单的生产要求 / 唛头与标签。');
 end if;
 perform 1 from public.romiku_production_orders where order_id=o.id and archived_at is null and status in ('pending','in_production') order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'document_number',document_number,'updated_at',updated_at) order by document_number,id),'[]') into rows from public.romiku_production_orders where order_id=o.id and archived_at is null and status in ('pending','in_production');
 token:=md5(o.production_defaults_snapshot::text || rows::text);
 if expected is null then return jsonb_build_object('ok',true,'token',token,'productions',rows,'source_snapshot',o.production_defaults_snapshot,'order_document_number',o.document_number); end if;
 if expected->>'token' is distinct from token then return jsonb_build_object('ok',false,'message','订单要求或生产单已变化，请重新预览后确认。'); end if;
 if jsonb_array_length(rows)=0 then return jsonb_build_object('ok',false,'message','没有可同步的未完成生产单。'); end if;
 saved:=o.production_defaults_snapshot || jsonb_build_object('source',jsonb_build_object('kind','order','id',o.id,'copied_at',now()),'initialized_at',now());
 update public.romiku_production_orders set marking_snapshot=saved
 where order_id=o.id and archived_at is null and status in ('pending','in_production')
 and id in (select (value->>'id')::uuid from jsonb_array_elements(rows));
 get diagnostics n=row_count;
 if n<>jsonb_array_length(rows) then raise exception 'denied'; end if;
 -- Re-read stored content after all row/statement triggers, inside this same transaction.
 select count(*) into verified from public.romiku_production_orders
 where id in (select (value->>'id')::uuid from jsonb_array_elements(rows)) and marking_snapshot=saved;
 if verified<>n then raise exception 'verification failed'; end if;
 return jsonb_build_object('ok',true,'count',n,'productions',rows,'source_snapshot',o.production_defaults_snapshot,'order_document_number',o.document_number);
exception when others then return jsonb_build_object('ok',false,'message','同步未完成，所有生产单保持原值，请刷新后重试。');
end
$$;
revoke all on function public.romiku_sync_order_production_defaults(uuid,jsonb) from public,anon;
grant execute on function public.romiku_sync_order_production_defaults(uuid,jsonb) to authenticated,service_role;

create or replace function public.romiku_delete_supplier(record_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  product_count integer;
  production_count integer;
  contact_count integer;
  task_count integer;
  parts text[] := '{}';
  dependencies jsonb;
begin
  if auth.uid() is null or coalesce(nullif(current_setting('role', true), 'none'), session_user) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', '请先登录。');
  end if;

  -- FK inserts take KEY SHARE on this parent. FOR UPDATE prevents a new
  -- dependency from racing between the count and the delete.
  perform 1 from public.romiku_suppliers where id = record_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '供应商不存在。');
  end if;

  select count(*) into product_count from public.romiku_product_suppliers where supplier_id = record_id;
  select count(*) into production_count from public.romiku_production_orders where supplier_id = record_id;
  select count(*) into contact_count from public.romiku_supplier_contacts where supplier_id = record_id;
  select count(*) into task_count from public.romiku_manual_tasks where supplier_id = record_id;
  dependencies := jsonb_build_object(
    'products', product_count, 'production_orders', production_count,
    'contacts', contact_count, 'manual_tasks', task_count
  );

  if product_count + production_count + contact_count + task_count > 0 then
    if product_count > 0 then parts := array_append(parts, format('%s 个产品', product_count)); end if;
    if production_count > 0 then parts := array_append(parts, format('%s 张生产单', production_count)); end if;
    if contact_count > 0 then parts := array_append(parts, format('%s 个联系人', contact_count)); end if;
    if task_count > 0 then parts := array_append(parts, format('%s 个手动任务', task_count)); end if;
    return jsonb_build_object('ok', false, 'code', 'HAS_DOWNSTREAM',
      'message', format('该供应商已关联 %s，无法删除。', array_to_string(parts, '、')),
      'dependencies', dependencies);
  end if;

  delete from public.romiku_suppliers where id = record_id;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'DELETE_FAILED',
    'message', '删除失败，供应商未被更改。请刷新后重试。');
end;
$$;

revoke all on function public.romiku_delete_supplier(uuid) from public, anon, authenticated;
grant execute on function public.romiku_delete_supplier(uuid) to authenticated;

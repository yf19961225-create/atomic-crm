-- ProductSupplier deletion must preserve procurement cost history. The parent
-- lock serializes this check with cost inserts, whose trigger locks the parent.
create or replace function public.romiku_delete_product_supplier(relation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(nullif(current_setting('role', true), 'none'), session_user) <> 'authenticated' then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', '请先登录。');
  end if;

  perform 1 from public.romiku_product_suppliers where id = relation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '供应商关联不存在。');
  end if;

  if exists (
    select 1 from public.romiku_procurement_cost_history
    where product_supplier_id = relation_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'HAS_COST_HISTORY',
      'message', '该供应商关联已有成本历史，不能直接删除。请先保留该关联或使用停用方式。');
  end if;

  delete from public.romiku_product_suppliers where id = relation_id;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'DELETE_FAILED',
    'message', '供应商关联删除失败，记录未被更改。');
end;
$$;

revoke all on function public.romiku_delete_product_supplier(uuid) from public, anon;
grant execute on function public.romiku_delete_product_supplier(uuid) to authenticated;
revoke delete on table public.romiku_product_suppliers from public, anon, authenticated;
drop policy if exists romiku_delete on public.romiku_product_suppliers;

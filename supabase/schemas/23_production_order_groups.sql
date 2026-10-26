-- Read-only parent pagination over all children visible through the caller's RLS.
CREATE OR REPLACE FUNCTION public.romiku_list_production_order_groups(
    p_search text DEFAULT '',
    p_view text DEFAULT 'ongoing',
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 25,
    p_order_id uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY INVOKER
    SET search_path TO ''
AS $function$
DECLARE
    result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_search IS NULL OR length(p_search) > 200 OR
       p_view IS NULL OR p_view NOT IN ('ongoing', 'received', 'cancelled', 'all') OR
       p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR
       p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'Invalid production group parameters' USING ERRCODE = '22023';
    END IF;

    WITH visible_children AS MATERIALIZED (
        SELECT p.*, s.name AS current_supplier_name,
            (btrim(p_search) <> '' AND position(lower(btrim(p_search)) IN lower(concat_ws(' ',
                p.document_number, s.name, p.supplier_snapshot->>'name'))) > 0) AS child_search_hit
        FROM public.romiku_production_orders p
        LEFT JOIN public.romiku_suppliers s ON s.id = p.supplier_id
        WHERE p_order_id IS NULL OR p.order_id = p_order_id
    ), groups AS (
        SELECT o.id, o.document_number, o.document_date,
            coalesce(nullif(o.counterparty_snapshot->>'company_name',''),
                nullif(o.counterparty_snapshot->>'company',''),
                nullif(o.counterparty_snapshot->>'name',''),
                nullif(o.counterparty_snapshot->>'business_name',''), '未填写客户') AS customer_name,
            count(*) AS production_count,
            count(*) FILTER (WHERE p.child_search_hit) AS matched_child_count,
            count(*) FILTER (WHERE p.status IN ('pending_send','scheduled')) AS ongoing_count,
            count(*) FILTER (WHERE p.status = 'received') AS received_count,
            count(*) FILTER (WHERE p.status = 'cancelled') AS cancelled_count,
            count(*) FILTER (WHERE p.status <> 'cancelled') AS effective_count,
            max(p.factory_due_at) AS latest_factory_due_at,
            max(p.created_at) AS latest_created_at,
            bool_or(p_search = '' OR position(lower(btrim(p_search)) IN lower(concat_ws(' ',
                o.document_number, o.counterparty_snapshot->>'company_name',
                o.counterparty_snapshot->>'company', o.counterparty_snapshot->>'name',
                o.counterparty_snapshot->>'business_name', p.document_number,
                p.current_supplier_name, p.supplier_snapshot->>'name'))) > 0) AS matches_search
        FROM public.romiku_orders o
        JOIN visible_children p ON p.order_id = o.id
        GROUP BY o.id
    ), eligible AS (
        SELECT * FROM groups WHERE matches_search AND (
            p_view = 'all' OR
            (p_view = 'ongoing' AND ongoing_count > 0) OR
            (p_view = 'received' AND ongoing_count = 0 AND received_count > 0) OR
            (p_view = 'cancelled' AND cancelled_count = production_count)
        )
    ), page_rows AS (
        SELECT e.*, coalesce((SELECT jsonb_agg((to_jsonb(hit) - 'exact_rank') ORDER BY hit.exact_rank, hit.document_number, hit.id)
            FROM (SELECT c.id, c.document_number,
                CASE WHEN lower(c.document_number) = lower(btrim(p_search)) THEN 0 ELSE 1 END AS exact_rank
                FROM visible_children c WHERE c.order_id = e.id AND c.child_search_hit
                ORDER BY exact_rank, c.document_number, c.id LIMIT 50) hit), '[]'::jsonb) AS matched_children
        FROM eligible e ORDER BY latest_created_at DESC, id ASC
        LIMIT p_page_size OFFSET ((p_page::bigint - 1) * p_page_size)
    )
    SELECT jsonb_build_object(
        'rows', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'matches_search'
            ORDER BY r.latest_created_at DESC, r.id ASC) FROM page_rows r), '[]'::jsonb),
        'total', (SELECT count(*) FROM eligible)
    ) INTO result;
    RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.romiku_list_production_order_groups(text,text,integer,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.romiku_list_production_order_groups(text,text,integer,integer,uuid) TO authenticated;

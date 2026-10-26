import { useEffect, useState } from "react";
import type { RaRecord } from "ra-core";
export function usePageSelection(
  rows: RaRecord[],
  scope: string,
  page: number,
  total: number | undefined,
  loading: boolean,
  setPage: (page: number) => void,
  maxSelection = Infinity,
) {
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope,
    ids: [],
  });
  const ids =
    selection.scope === scope
      ? selection.ids
          .filter((id) => rows.some((r) => String(r.id) === id))
          .slice(0, maxSelection)
      : [];
  useEffect(() => {
    setSelection({ scope, ids: [] });
  }, [scope]);
  useEffect(() => {
    if (
      !loading &&
      total !== undefined &&
      page > Math.max(1, Math.ceil(total / 25))
    )
      setPage(Math.max(1, Math.ceil(total / 25)));
  }, [total, page, loading, setPage]);
  const set = (next: string[]) => setSelection({ scope, ids: next });
  const clear = () => set([]);
  const all =
    !!rows.length && ids.length === Math.min(rows.length, maxSelection);
  const header = (
    <input
      type="checkbox"
      aria-label={
        Number.isFinite(maxSelection)
          ? `全选当前页（最多 ${maxSelection} 条）`
          : "全选当前页"
      }
      disabled={loading || !rows.length}
      checked={all}
      ref={(node) => {
        if (node) node.indeterminate = ids.length > 0 && !all;
      }}
      onChange={(e) =>
        set(
          e.target.checked
            ? rows.slice(0, maxSelection).map((r) => String(r.id))
            : [],
        )
      }
    />
  );
  const checkbox = (record: RaRecord) => (
    <input
      type="checkbox"
      aria-label={`选择 ${record.document_number || record.name || record.customer_name || "记录"}`}
      disabled={
        loading ||
        (!ids.includes(String(record.id)) && ids.length >= maxSelection)
      }
      checked={ids.includes(String(record.id))}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) =>
        set(
          e.target.checked
            ? [...ids, String(record.id)]
            : ids.filter((id) => id !== String(record.id)),
        )
      }
    />
  );
  return { ids, clear, header, checkbox };
}

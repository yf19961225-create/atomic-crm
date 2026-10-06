import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import { statusLabel, type WorkflowResource } from "./workflowStatus";
import { statusTimestamp } from "./StatusAge";

type Cursor = { changed_at: string; id: string } | null;
type Entry = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
  change_source: string;
};
type HistoryPage = { records: Entry[]; has_more: boolean; next_cursor: Cursor };
const sources: Record<string, string> = {
  manual: "手动修改",
  batch: "批量修改",
  system: "系统操作",
  create: "新建",
  conversion: "单据转换",
  migration: "系统初始化",
};
export function StatusHistoryPanel({
  resourceType,
  resourceId,
}: {
  resourceType: WorkflowResource;
  resourceId: string;
}) {
  const [open, setOpen] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ["romiku-status-history", resourceType, resourceId],
    enabled: open,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      const { data, error } = await getSupabaseClient().rpc(
        "romiku_get_status_history",
        {
          resource_type: resourceType,
          resource_id: resourceId,
          page_size: 20,
          before_changed_at: pageParam?.changed_at ?? null,
          before_id: pageParam?.id ?? null,
        },
      );
      if (error || !Array.isArray(data?.records))
        throw new Error("状态记录加载失败，请重试。");
      return data as HistoryPage;
    },
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    staleTime: 0,
  });
  const entries = history.data?.pages.flatMap((page) => page.records) || [];
  return (
    <details
      className="rounded border p-3 text-sm"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">状态记录</summary>
      {open && (
        <div className="mt-3 space-y-3">
          {history.isPending && <p>正在加载状态记录…</p>}
          {history.isError && (
            <div role="alert">
              状态记录加载失败，请重试。{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void history.refetch()}
              >
                重试
              </Button>
            </div>
          )}
          {!history.isPending && !history.isError && !entries.length && (
            <p>暂无状态记录</p>
          )}
          <ol className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="border-l-2 pl-3">
                <div className="text-muted-foreground">
                  <span>
                    {entry.changed_by
                      ? entry.changed_by_name || "已登录用户"
                      : "系统"}
                  </span>{" "}
                  ·{" "}
                  <time dateTime={entry.changed_at}>
                    {statusTimestamp(entry.changed_at)}
                  </time>{" "}
                  · {sources[entry.change_source] || "状态变更"}
                </div>
                <p>
                  {entry.change_source === "migration"
                    ? `系统初始化状态记录 · ${statusLabel(resourceType, entry.to_status)}`
                    : `${entry.from_status === null ? "新建" : statusLabel(resourceType, entry.from_status)} → ${statusLabel(resourceType, entry.to_status)}`}
                </p>
                {entry.change_source === "migration" && (
                  <p className="text-xs text-muted-foreground">
                    从此时开始记录；此前进入该状态的时间未知。
                  </p>
                )}
              </li>
            ))}
          </ol>
          {history.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? "加载中…" : "加载更多"}
            </Button>
          )}
        </div>
      )}
    </details>
  );
}

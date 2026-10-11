import { statusLabel } from "../shared/workflowStatus";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import {
  matchedFieldLabel,
  searchBusinessRecords,
  searchLabels,
  searchPath,
  searchTypes,
  type SearchGroup,
  type SearchItem,
} from "./search";
import { SearchInput } from "./SearchInput";

function GroupResults({ group, query }: { group: SearchGroup; query: string }) {
  const [items, setItems] = useState<SearchItem[]>(group.items);
  const [offset, setOffset] = useState(group.offset + group.items.length);
  const [totalCount, setTotalCount] = useState(group.total_count);
  const [hasMore, setHasMore] = useState(group.has_more);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function more() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await searchBusinessRecords(
        getSupabaseClient().rpc.bind(getSupabaseClient()),
        {
          query,
          resource_types: [group.resource_type],
          limit: 5,
          offset,
          filters: {},
        },
      );
      const next = response.groups.find(
        (entry) => entry.resource_type === group.resource_type,
      );
      if (!next) throw new Error("搜索结果缺少记录分组，请重试。");
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...next.items.filter((item) => !seen.has(item.id))];
      });
      setOffset(next.offset + next.items.length);
      setTotalCount(next.total_count);
      setHasMore(next.has_more);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "搜索失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-2 rounded border p-4"
      aria-label={searchLabels[group.resource_type]}
    >
      <h2 className="font-semibold">
        {searchLabels[group.resource_type]} · {totalCount}
      </h2>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                className="underline"
                to={searchPath(group.resource_type, item.id)}
              >
                {item.title}
              </Link>
              {item.status && (
                <span className="ml-2 rounded bg-muted px-2 text-xs">
                  {statusLabel(group.resource_type, item.status)}
                </span>
              )}
              {item.subtitle && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {item.subtitle}
                </span>
              )}
              {item.matched_fields.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  匹配：
                  {Array.from(
                    new Set(item.matched_fields.map(matchedFieldLabel)),
                  ).join("、")}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">无匹配记录</p>
      )}
      {error && <p role="alert">{error}</p>}
      {hasMore && (
        <Button variant="outline" disabled={busy} onClick={() => void more()}>
          {busy ? "正在加载…" : "加载更多"}
        </Button>
      )}
    </section>
  );
}

export function GlobalSearch() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get("q") || "");
  const [query, setQuery] = useState(params.get("q")?.trim() || "");
  const result = useQuery({
    queryKey: ["romiku-search", "global", query],
    enabled: !!query,
    placeholderData: keepPreviousData,
    queryFn: () =>
      searchBusinessRecords(getSupabaseClient().rpc.bind(getSupabaseClient()), {
        query,
        resource_types: [...searchTypes],
        limit: 5,
        offset: 0,
        filters: {},
      }),
  });
  const lastResult = useRef<{
    query: string;
    data: NonNullable<typeof result.data>;
    updatedAt: number;
  } | null>(null);
  if (query && result.data && !result.isPlaceholderData && !result.error) {
    lastResult.current = {
      query,
      data: result.data,
      updatedAt: result.dataUpdatedAt,
    };
  }
  const shown = query ? lastResult.current : null;
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">全局搜索</h1>
      <SearchInput
        value={value}
        onChange={setValue}
        onSubmit={(next) => {
          setQuery(next);
          setParams(next ? { q: next } : {}, { replace: true });
        }}
        onClear={() => {
          setValue("");
          setQuery("");
          lastResult.current = null;
          setParams({}, { replace: true });
        }}
        busy={result.isFetching}
      />
      {!query && (
        <p className="text-muted-foreground">
          输入编号、客户、联系人、产品或电话，按 Enter 或点击搜索。
        </p>
      )}
      {query && result.isFetching && <p role="status">正在搜索…</p>}
      {query && result.error && (
        <p role="alert">
          {result.error.message}{" "}
          <Button onClick={() => void result.refetch()}>重试</Button>
        </p>
      )}
      {shown && (
        <div className="grid gap-4 lg:grid-cols-2">
          {searchTypes.map((type) => {
            const group = shown.data.groups.find(
              (entry) => entry.resource_type === type,
            );
            return group ? (
              <GroupResults
                key={`${shown.query}:${type}:${shown.updatedAt}`}
                query={shown.query}
                group={group}
              />
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}

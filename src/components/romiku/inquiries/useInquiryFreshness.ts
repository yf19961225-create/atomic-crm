import { useCallback, useEffect, useRef, useState } from "react";
import { useGetList } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { useInquiryListRefresh } from "./useInquiryListRefresh";

/** Query success counters distinguish real requests from restored persistent cache. */
export function useInquiryFreshness(
  enabled: boolean,
  query: {
    dataUpdatedAt: number;
    isFetchedAfterMount: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  },
  obscured: boolean,
  firstVisibleId: string,
  matchesQuery: (key: readonly unknown[]) => boolean,
) {
  const cache = useQueryClient();
  const matcher = useRef(matchesQuery);
  matcher.current = matchesQuery;
  const [lastSuccess, setLastSuccess] = useState<number>();
  const [newCount, setNewCount] = useState(0);
  const baseline = useRef<{ total: number; latest: string } | undefined>(
    undefined,
  );
  const latest = useGetList(
    "romiku_website_inquiries",
    {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "submitted_at", order: "DESC" },
      filter: {},
    },
    { enabled, refetchOnWindowFocus: "always", retry: false },
  );
  useEffect(() => {
    if (!enabled) return;
    return cache.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        !event.action.manual &&
        matcher.current(event.query.queryKey)
      )
        setLastSuccess(event.query.state.dataUpdatedAt);
    });
  }, [enabled, cache]);
  useEffect(() => {
    if (
      !enabled ||
      !latest.isFetchedAfterMount ||
      latest.error ||
      latest.total === undefined
    )
      return;
    const next = {
      total: latest.total,
      latest: String(latest.data?.[0]?.id || ""),
    };
    if (!obscured || firstVisibleId === next.latest || !baseline.current) {
      baseline.current = next;
      setNewCount(0);
      return;
    }
    const before = baseline.current;
    setNewCount(
      Math.max(
        0,
        next.total - before.total,
        next.latest !== before.latest && next.total >= before.total ? 1 : 0,
      ),
    );
  }, [
    enabled,
    obscured,
    firstVisibleId,
    latest.dataUpdatedAt,
    latest.isFetchedAfterMount,
    latest.error,
    latest.total,
    latest.data,
  ]);
  const refetch = query.refetch,
    refetchLatest = latest.refetch;
  const refresh = useCallback(async () => {
    await Promise.allSettled([
      refetch(),
      ...(enabled ? [refetchLatest()] : []),
    ]);
  }, [enabled, refetch, refetchLatest]);
  useInquiryListRefresh(enabled, refresh);
  return {
    lastSuccess,
    newCount,
    refresh,
    latestStatus: latest.data?.[0]?.status,
  };
}

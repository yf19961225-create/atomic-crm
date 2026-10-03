import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDataProvider, type RaRecord } from "ra-core";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import {
  hydrateSearchPage,
  searchBusinessRecords,
  type SearchFilters,
  type SearchGroup,
  type SearchType,
} from "./search";

export function useDebouncedSearch(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced.trim();
}

export function useModuleSearch(
  type: SearchType,
  resource: string,
  value: string,
  page: number,
  filters: SearchFilters = {},
) {
  const query = useDebouncedSearch(value);
  const provider = useDataProvider();
  const result = useQuery({
    queryKey: [
      "romiku-search",
      type,
      query,
      page,
      filters.status || "",
      filters.order_id || "",
    ],
    enabled: !!query,
    queryFn: async () => {
      const response = await searchBusinessRecords(
        getSupabaseClient().rpc.bind(getSupabaseClient()),
        {
          query,
          resource_types: [type],
          limit: 25,
          offset: (page - 1) * 25,
          filters,
        },
      );
      const group = response.groups.find(
        (entry) => entry.resource_type === type,
      );
      if (!group) throw new Error("搜索结果缺少记录分组，请重试。");
      const data = await hydrateSearchPage(
        provider.getMany.bind(provider),
        resource,
        group,
      );
      return { data, group };
    },
  });
  const ready = !!query && value.trim() === query;
  return {
    ...result,
    isPending: !!value.trim() && !ready ? true : result.isPending,
    active: !!value.trim(),
    data: ready ? (result.data?.data as RaRecord[] | undefined) : undefined,
    group: ready ? (result.data?.group as SearchGroup | undefined) : undefined,
  };
}

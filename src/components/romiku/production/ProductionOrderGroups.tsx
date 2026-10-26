import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataProvider, type RaRecord } from "ra-core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BulkActions } from "../shared/BulkActions";
import { usePageSelection } from "../shared/usePageSelection";
import { InlineStatusSelect } from "../shared/InlineStatusSelect";
import { RecordDelete } from "../shared/RecordDelete";
import { SearchInput } from "../search/SearchInput";
import { productionStatusChoices } from "../commercialLabels";
import { productionDueDateLabel } from "./productionDueDate";
import {
  readProductionOrderGroups,
  type ProductionGroupView,
  type ProductionOrderGroup,
} from "./productionOrderGroupsQuery";

const views: Array<[ProductionGroupView, string]> = [
  ["ongoing", "进行中"],
  ["received", "已收货"],
  ["cancelled", "已取消"],
  ["all", "全部"],
];
const localDate = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString("zh-CN", { hour12: false })
    : "—";
export function ProductionOrderGroups() {
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const [viewState, setView] = useState<{
    order: string | null;
    view: ProductionGroupView;
  }>({ order: orderId, view: orderId ? "all" : "ongoing" });
  const view =
    viewState.order === orderId ? viewState.view : orderId ? "all" : "ongoing";
  const [page, setPage] = useState(1),
    [input, setInput] = useState(""),
    [search, setSearch] = useState("");
  const scope = JSON.stringify([orderId, view, page, search]);
  const [expanded, setExpanded] = useState<{ scope: string; ids: string[] }>({
    scope,
    ids: [],
  });
  const [loaded, setLoaded] = useState<Record<string, RaRecord[]>>({});
  const query = useQuery({
    queryKey: ["production-order-groups", search, view, page, orderId],
    queryFn: () => readProductionOrderGroups(search, view, page, orderId),
  });
  const groups = query.data?.rows ?? [];
  const expandedIds =
    expanded.scope === scope
      ? expanded.ids.filter((id) => groups.some((g) => g.id === id))
      : [];
  const childRows = expandedIds.flatMap((id) => loaded[id] ?? []);
  const selection = usePageSelection(
    childRows,
    scope,
    page,
    query.data?.total,
    query.isPending || !!query.error,
    setPage,
    100,
  );
  const onLoaded = useCallback(
    (id: string, rows: RaRecord[]) =>
      setLoaded((prior) =>
        prior[id] === rows ? prior : { ...prior, [id]: rows },
      ),
    [],
  );
  useEffect(() => {
    setPage(1);
  }, [orderId]);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">生产管理</h1>
        <Button asChild>
          <Link
            to={`/production/new${orderId ? `?order=${encodeURIComponent(orderId)}` : ""}`}
          >
            新建生产单
          </Link>
        </Button>
      </div>
      <SearchInput
        label="搜索生产管理"
        value={input}
        onChange={setInput}
        onSubmit={(next) => {
          setSearch(next);
          setPage(1);
          if (next === search && page === 1) void query.refetch();
        }}
        onClear={() => {
          setInput("");
          setSearch("");
          setPage(1);
        }}
        busy={query.isFetching}
      />
      {orderId && (
        <p>
          订单历史 ·{" "}
          <Link className="underline" to={`/orders/${orderId}`}>
            返回订单
          </Link>{" "}
          ·{" "}
          <Link className="underline" to="/production">
            全部订单
          </Link>
        </p>
      )}
      <div
        role="tablist"
        aria-label="生产订单视图"
        className="flex flex-wrap gap-2"
      >
        {views.map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={view === key}
            variant={view === key ? "default" : "outline"}
            onClick={() => {
              setView({ order: orderId, view: key });
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        按订单汇总全部可见生产子单；进度不含已取消子单。批量操作仅作用于勾选的生产子单。每批最多选择
        100 张生产子单，可分批操作。
      </p>
      <BulkActions
        kind="production"
        ids={selection.ids}
        onDone={selection.clear}
        disabled={query.isPending || !!query.error}
      />
      {!!childRows.length && (
        <label className="flex items-center gap-2 text-sm">
          {selection.header}全选当前页已加载的生产子单
        </label>
      )}
      {query.isPending && <p role="status">正在加载生产订单…</p>}
      {query.error && (
        <p role="alert">
          无法加载生产订单。
          <Button onClick={() => query.refetch()}>重试</Button>
        </p>
      )}
      {!query.isPending && !query.error && !groups.length && (
        <p>未找到记录。</p>
      )}
      {groups.map((group) => (
        <article key={group.id} className="rounded border">
          <div className="flex flex-wrap items-start gap-3 p-3 md:grid md:grid-cols-[minmax(200px,2fr)_1fr_2fr_auto]">
            <div>
              <Button
                variant="ghost"
                className="h-auto px-1"
                aria-expanded={expandedIds.includes(group.id)}
                aria-label={`${expandedIds.includes(group.id) ? "收起" : "展开"} ${group.document_number}`}
                onClick={() =>
                  setExpanded({
                    scope,
                    ids: expandedIds.includes(group.id)
                      ? expandedIds.filter((id) => id !== group.id)
                      : [...expandedIds, group.id],
                  })
                }
              >
                {expandedIds.includes(group.id) ? "▾" : "▸"}
              </Button>
              <Link
                className="font-semibold underline"
                to={`/orders/${group.id}`}
              >
                {group.document_number}
              </Link>
              <p className="mt-1">{group.customer_name}</p>
            </div>
            <div className="text-sm">
              订单日期<p>{group.document_date || "—"}</p>
              <p>{group.production_count} 张生产单</p>
            </div>
            <div className="text-sm">
              <p>
                进行中 {group.ongoing_count} · 已收货 {group.received_count} ·
                已取消 {group.cancelled_count}
              </p>
              <p>
                收货进度 {group.received_count} / {group.effective_count}
              </p>
              <progress
                aria-label={`${group.document_number} 收货进度`}
                max={group.effective_count || 1}
                value={group.received_count}
                className="mt-1 w-full"
              />
            </div>
            <div className="text-sm">
              最近工厂交期
              <p>{productionDueDateLabel(group.latest_factory_due_at)}</p>
            </div>
          </div>
          {search.trim() && !!group.matched_child_count && (
            <div
              className="flex flex-wrap items-center gap-2 border-t p-3 text-sm"
              aria-label={`${group.document_number} 搜索命中`}
            >
              <span>命中 {group.matched_child_count} 张生产子单：</span>
              {(group.matched_children ?? []).map((child) => (
                <Link
                  key={child.id}
                  className="rounded bg-muted px-2 py-1 underline"
                  aria-label={`命中生产单 ${child.document_number}`}
                  to={`/production/${child.id}`}
                >
                  {child.document_number}
                </Link>
              ))}
              {group.matched_child_count >
                (group.matched_children?.length ?? 0) && (
                <span>仅列出前 50 条命中，可展开完整历史继续查看。</span>
              )}
            </div>
          )}
          {expandedIds.includes(group.id) && (
            <ProductionChildren
              key={`${scope}:${group.id}`}
              group={group}
              search={search}
              onLoaded={onLoaded}
              checkbox={selection.checkbox}
              onDeleted={selection.clear}
            />
          )}
        </article>
      ))}
      <div className="flex items-center gap-3">
        <Button
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <span>
          第 {page} 页 · 共 {query.data?.total ?? 0} 个订单
        </span>
        <Button
          disabled={query.isFetching || page * 25 >= (query.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
}
function ProductionChildren({
  group,
  search,
  onLoaded,
  checkbox,
  onDeleted,
}: {
  group: ProductionOrderGroup;
  search: string;
  onLoaded: (id: string, rows: RaRecord[]) => void;
  checkbox: (record: RaRecord) => React.ReactNode;
  onDeleted: () => void;
}) {
  const provider = useDataProvider();
  const query = useInfiniteQuery({
    queryKey: ["production-group-children", group.id],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      provider.getList("romiku_production_orders", {
        filter: { order_id: group.id },
        pagination: { page: pageParam, perPage: 100 },
        sort: { field: "document_number", order: "ASC" },
      }),
    getNextPageParam: (last, pages) =>
      pages.reduce((sum, p) => sum + p.data.length, 0) <
        (last.total ?? Infinity) && last.data.length === 100
        ? pages.length + 1
        : undefined,
  });
  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
    [query.data],
  );
  useEffect(() => {
    onLoaded(group.id, rows);
  }, [group.id, rows, onLoaded]);
  const supplierIds = [
    ...new Set(rows.map((row) => row.supplier_id).filter(Boolean)),
  ];
  const suppliers = useQuery({
    queryKey: ["production-group-suppliers", supplierIds],
    queryFn: () => provider.getMany("romiku_suppliers", { ids: supplierIds }),
    enabled: supplierIds.length > 0,
  });
  return (
    <div className="ml-3 border-t border-l bg-muted/20 p-3 md:ml-8">
      {query.isPending && <p>正在加载生产子单…</p>}
      {query.error && (
        <p role="alert">
          无法加载生产子单。
          <Button onClick={() => query.refetch()}>重试</Button>
        </p>
      )}
      {rows.map((row) => (
        <div
          className="grid gap-2 border-b py-3 text-sm md:grid-cols-[auto_2fr_2fr_2fr_2fr_2fr_auto] md:items-center"
          key={row.id}
        >
          <span>{checkbox(row)}</span>
          <Link className="underline" to={`/production/${row.id}`}>
            {row.document_number || "未编号生产单"}
            {search.trim() &&
              [
                row.document_number,
                row.supplier_snapshot?.name,
                suppliers.data?.data.find((s) => s.id === row.supplier_id)
                  ?.name,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(search.trim().toLowerCase()) && (
                <span
                  className="ml-2 rounded bg-muted px-1"
                  aria-label={`搜索命中 ${row.document_number}`}
                >
                  命中
                </span>
              )}
          </Link>
          <span>
            {row.supplier_snapshot?.name ||
              suppliers.data?.data.find((s) => s.id === row.supplier_id)
                ?.name ||
              "未指定供应商"}
          </span>
          <InlineStatusSelect
            resource="romiku_production_orders"
            recordId={String(row.id)}
            recordLabel={row.document_number}
            status={row.status}
            label="生产状态"
            choices={productionStatusChoices.map((c) => ({
              value: c.id,
              label: c.label,
            }))}
          />
          <span>工厂交期：{productionDueDateLabel(row.factory_due_at)}</span>
          <span>生成：{localDate(row.created_at)}</span>
          <span className="flex gap-2">
            <Link className="underline" to={`/production/${row.id}`}>
              查看 / 编辑
            </Link>
            <RecordDelete
              kind="production"
              id={String(row.id)}
              label={row.document_number || String(row.id)}
              onDeleted={onDeleted}
            />
          </span>
        </div>
      ))}
      <p className="mt-2 text-sm text-muted-foreground">
        已加载 {rows.length} / {group.production_count} 张生产单
      </p>
      {query.hasNextPage && (
        <Button
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          加载更多生产子单
        </Button>
      )}
    </div>
  );
}

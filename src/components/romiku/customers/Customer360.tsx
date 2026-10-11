import { useSearchParams } from "react-router";
import { useRef, useState, type ReactNode } from "react";
import { useGetOne, type RaRecord } from "ra-core";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SearchInput } from "../search/SearchInput";
import { searchLabels } from "../search/search";
import {
  CustomerBusinessHistory,
  BusinessLink,
} from "./CustomerBusinessHistory";
import { CustomerDocuments } from "./CustomerDocuments";
import {
  customerRpc,
  money,
  type BusinessKind,
  type DocumentsResponse,
  type HistoryResponse,
} from "./customerBusinessApi";
export function Customer360({
  record,
  profile,
}: {
  record: RaRecord;
  profile: ReactNode;
}) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(
      params.get("customerTab") === "客户资料" ? "客户资料" : "业务记录",
    ),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [kind, setKind] = useState<BusinessKind | "all">("all");
  const directory = useGetOne("romiku_formal_customer_directory", {
    id: record.id,
  });
  const customer = directory.data || record;
  const history = useQuery({
    queryKey: ["customer360-history", record.id, page, query],
    queryFn: () =>
      customerRpc<HistoryResponse>("romiku_customer_business_history", {
        customer_id: record.id,
        limit: 10,
        offset: page * 10,
        query,
      }),
    enabled: tab === "业务记录",
    placeholderData: keepPreviousData,
  });
  const documents = useQuery({
    queryKey: ["customer360-documents", record.id, kind, page, query],
    queryFn: () =>
      customerRpc<DocumentsResponse>("romiku_customer_documents", {
        customer_id: record.id,
        resource_type: kind,
        limit: 25,
        offset: page * 25,
        query,
      }),
    enabled: tab === "全部单据",
    placeholderData: keepPreviousData,
  });
  const lastHistory = useRef<HistoryResponse | null>(null);
  const lastDocuments = useRef<DocumentsResponse | null>(null);
  if (history.data && !history.isPlaceholderData)
    lastHistory.current = history.data;
  if (documents.data && !documents.isPlaceholderData)
    lastDocuments.current = documents.data;
  const shownHistory = history.data ?? lastHistory.current;
  const shownDocuments = documents.data ?? lastDocuments.current;
  const active = tab === "全部单据" ? documents : history;
  const summaryQuery = useQuery({
    queryKey: ["customer360-history", record.id, 0, ""],
    queryFn: () =>
      customerRpc<HistoryResponse>("romiku_customer_business_history", {
        customer_id: record.id,
        limit: 10,
        offset: 0,
        query: "",
      }),
  });
  const summary = summaryQuery.data?.summary;
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p>状态：{record.status === "inactive" ? "停用" : "启用"}</p>
        <h2 className="text-2xl font-semibold">
          {customer.name}
          {customer.brand && ` · ${customer.brand}`}
        </h2>
        <p>
          {customer.country || "国家未填写"} ·{" "}
          {customer.contact || "主要联系人未填写"}
        </p>
        <p>
          WhatsApp：{customer.whatsapp || "—"} · Email：{customer.email || "—"}
        </p>
        <p className="text-muted-foreground text-sm">
          已成交客户档案 · 仅使用明确关联的业务记录
        </p>
      </div>
      {summary && (
        <section
          aria-label="客户业务摘要"
          className="rounded border bg-muted/30 p-3 space-y-2"
        >
          <p>
            订单总数 {summary.order_count} · 进行中 {summary.in_progress} ·
            已完成 {summary.completed}
          </p>
          <div className="flex flex-wrap gap-4">
            {summary.totals.map((t) => (
              <strong key={t.currency}>{money(t.amount, t.currency)}</strong>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            累计订单金额按币种分别统计，包含草稿、不含取消或作废订单；不做汇率换算。归档记录保持可见。
          </p>
          {summary.latest && (
            <p>
              最近下单 {summary.latest.document_date} ·{" "}
              <BusinessLink kind="order" record={summary.latest} />
            </p>
          )}
        </section>
      )}
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setPage(0);
        }}
      >
        <TabsList>
          <TabsTrigger value="业务记录">业务记录</TabsTrigger>
          <TabsTrigger value="全部单据">全部单据</TabsTrigger>
          <TabsTrigger value="客户资料">客户资料</TabsTrigger>
        </TabsList>
        {tab !== "客户资料" && (
          <div className="my-4 space-y-3">
            <SearchInput
              label="搜索这个客户的单号、SKU、产品"
              value={search}
              onChange={setSearch}
              onSubmit={(next) => {
                setQuery(next);
                setPage(0);
              }}
              onClear={() => {
                setSearch("");
                setQuery("");
                setPage(0);
              }}
              busy={active.isFetching}
            />
            {tab === "全部单据" && (
              <label>
                单据类型{" "}
                <select
                  aria-label="单据类型"
                  className="rounded border p-2"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as BusinessKind | "all");
                    setPage(0);
                  }}
                >
                  <option value="all">全部</option>
                  {(
                    ["quote", "pi", "order", "production", "packing"] as const
                  ).map((k) => (
                    <option value={k} key={k}>
                      {searchLabels[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              来源链按真实关联展示；无客户关联的独立 Packing
              暂不纳入，不按名称推断。
            </p>
            {active.isFetching && <p role="status">正在加载业务记录…</p>}
            {active.error && (
              <p role="alert">
                {active.error.message}{" "}
                <Button variant="outline" onClick={() => void active.refetch()}>
                  重试
                </Button>
              </p>
            )}
          </div>
        )}
        <TabsContent value="业务记录">
          {shownHistory && (
            <CustomerBusinessHistory orders={shownHistory.orders} />
          )}
        </TabsContent>
        <TabsContent value="全部单据">
          {shownDocuments && <CustomerDocuments items={shownDocuments.items} />}
        </TabsContent>
        <TabsContent
          value="客户资料"
          forceMount
          hidden={tab !== "客户资料"}
          className={tab !== "客户资料" ? "hidden" : undefined}
        >
          {profile}
        </TabsContent>
        {tab !== "客户资料" && (
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              disabled={page === 0 || active.isFetching}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <span>
              第 {page + 1} 页 · 共{" "}
              {(tab === "全部单据"
                ? shownDocuments?.total_count
                : shownHistory?.total_count) || 0}{" "}
              {tab === "业务记录" ? "张订单" : "张单据"}
            </span>
            <Button
              variant="outline"
              disabled={!active.data?.has_more || active.isFetching}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </Tabs>
    </div>
  );
}

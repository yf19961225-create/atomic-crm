import { useState, type ReactNode } from "react";
import { useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useDebouncedSearch } from "../search/useBusinessSearch";
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
  const [tab, setTab] = useState("业务记录"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [kind, setKind] = useState<BusinessKind | "all">("all");
  const query = useDebouncedSearch(search),
    ready = search.trim() === query;
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
  });
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
            <input
              type="search"
              className="w-full rounded border p-2"
              aria-label="搜索这个客户的单号、SKU、产品"
              placeholder="搜索这个客户的单号、SKU、产品、规格…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
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
            {(active.isPending || !ready) && <p>正在加载业务记录…</p>}
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
          {ready && history.data && (
            <CustomerBusinessHistory orders={history.data.orders} />
          )}
        </TabsContent>
        <TabsContent value="全部单据">
          {ready && documents.data && (
            <CustomerDocuments items={documents.data.items} />
          )}
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
              disabled={page === 0 || active.isFetching || !ready}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <span>
              第 {page + 1} 页 · 共{" "}
              {ready ? active.data?.total_count || 0 : "…"}{" "}
              {tab === "业务记录" ? "张订单" : "张单据"}
            </span>
            <Button
              variant="outline"
              disabled={!active.data?.has_more || active.isFetching || !ready}
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

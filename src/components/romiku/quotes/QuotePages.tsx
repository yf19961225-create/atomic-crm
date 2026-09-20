import { useState } from "react";
import { Link, useParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowFields, type Field } from "../outbound/WorkflowFields";
import { errorMessage } from "../outbound/RelatedRecords";
import { quoteHeaderWrite, quoteStatuses } from "./quoteWorkflow";
import { CommercialLineItemsTable } from "../commercial/CommercialLineItemsTable";
import { DocumentFinancialSummary } from "../commercial/DocumentFinancialSummary";
import { DocumentHeaderSummary } from "../commercial/DocumentHeaderSummary";
import {
  commitCommercialItems,
  readCommercialItems,
} from "../commercial/commercialLineItems";
import {
  useDocumentEditSession,
  useUnsavedDocumentGuard,
} from "../commercial/useDocumentEditSession";
import { DocumentConversion } from "../orders/DocumentConversion";
import { quoteStatusChoices, quoteStatusLabel } from "../commercialLabels";

function SourceLinks({ record }: { record: RaRecord }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {record.source_website_inquiry_id && (
        <Link
          className="underline"
          to={`/website-inquiries?record=${encodeURIComponent(record.source_website_inquiry_id)}`}
        >
          网站询盘
        </Link>
      )}
      {record.outbound_company_id && (
        <Link
          className="underline"
          to={`/outbound-development?record=${encodeURIComponent(record.outbound_company_id)}`}
        >
          主动开发
        </Link>
      )}
      {record.formal_customer_id && (
        <Link
          className="underline"
          to={`/formal-customers?record=${encodeURIComponent(record.formal_customer_id)}`}
        >
          正式客户
        </Link>
      )}
      {!record.source_website_inquiry_id &&
        !record.outbound_company_id &&
        !record.formal_customer_id && <span>直接创建</span>}
    </div>
  );
}
export function QuoteList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const {
    data = [],
    total,
    isPending,
    error,
    refetch,
  } = useGetList("romiku_quote_totals", {
    pagination: { page, perPage: 25 },
    sort: { field: "created_at", order: "DESC" },
    filter: {
      ...(status ? { status } : {}),
      ...(search ? { "document_number@ilike": `%${search}%` } : {}),
    },
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">报价单</h1>
        <Button asChild>
          <Link to="/quotes/new">新建报价单</Link>
        </Button>
      </div>
      <p className="text-muted-foreground">
        独立报价单保留来源历史，并可编辑采购方、产品和商务快照。
      </p>
      <div className="flex flex-wrap gap-4">
        <label>
          报价单编号{" "}
          <input
            className="rounded border p-2"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          状态{" "}
          <select
            className="rounded border p-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            {quoteStatuses.map((value) => (
              <option key={value} value={value}>
                {quoteStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending && <p>正在加载报价单…</p>}
      {error && (
        <div role="alert">
          无法加载报价单。{" "}
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                "报价单",
                "采购方",
                "来源",
                "状态",
                "日期",
                "有效期至",
                "合计",
              ].map((label) => (
                <th key={label} className="p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="p-3">
                  <Link
                    className="font-medium underline"
                    to={`/quotes/${record.id}`}
                  >
                    {record.document_number}
                  </Link>
                </td>
                <td className="p-3">{record.counterparty_snapshot?.name}</td>
                <td className="p-3">
                  <SourceLinks record={record} />
                </td>
                <td className="p-3">{quoteStatusLabel(record.status)}</td>
                <td className="p-3">{record.document_date}</td>
                <td className="p-3">{record.valid_until || "—"}</td>
                <td className="p-3">
                  {record.currency} {Number(record.total).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !error && !data.length && (
          <p className="p-6 text-center">未找到报价单。</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <span>
          第 {page} 页{total !== undefined && ` · 共 ${total} 张报价单`}
        </span>
        <Button
          variant="outline"
          disabled={total !== undefined ? page * 25 >= total : data.length < 25}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
}
export function QuoteDetail() {
  const { id = "" } = useParams();
  const { data, isPending, error, refetch } = useGetOne("romiku_quotes", {
    id,
  });
  if (isPending) return <p>正在加载报价单…</p>;
  if (error || !data)
    return (
      <p role="alert">
        无法加载此报价单。{" "}
        <Link to="/quotes" className="underline">
          返回报价单
        </Link>
      </p>
    );
  return <QuoteEditor key={id} record={data} onSaved={refetch} />;
}
const buyerFields: Field[] = [
  { key: "counterparty_snapshot.name", label: "采购方名称", required: true },
  { key: "counterparty_snapshot.company", label: "公司名称" },
  { key: "counterparty_snapshot.email", label: "邮箱", type: "email" },
  { key: "counterparty_snapshot.whatsapp", label: "WhatsApp" },
  { key: "counterparty_snapshot.country", label: "国家/地区" },
  { key: "counterparty_snapshot.address", label: "地址", type: "textarea" },
  {
    key: "status",
    label: "报价单状态",
    required: true,
    choices: quoteStatusChoices,
  },
  { key: "valid_until", label: "有效期至（YYYY-MM-DD）" },
];
const termsFields: Field[] = [
  { key: "price_term", label: "价格条款" },
  { key: "shipment_method", label: "运输方式" },
  {
    key: "terms_snapshot.payment_terms",
    label: "付款条款",
    type: "textarea",
  },
  {
    key: "terms_snapshot.delivery_terms",
    label: "交付条款",
    type: "textarea",
  },
  { key: "terms_snapshot.lead_time", label: "交期" },
  { key: "bank_snapshot.details", label: "银行信息", type: "textarea" },
  { key: "discount", label: "折扣" },
  { key: "notes", label: "报价单备注", type: "textarea" },
];
function QuoteEditor({
  record,
  onSaved,
}: {
  record: RaRecord;
  onSaved: () => Promise<unknown>;
}) {
  const provider = useDataProvider();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const items = useQuery({
    queryKey: ["quote-items", record.id],
    queryFn: () => readCommercialItems(provider, "quote", String(record.id)),
  });
  const customers = useGetList("romiku_formal_customers", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
    filter: {},
  });
  const session = useDocumentEditSession(record, items.data);
  const confirmDiscard = useUnsavedDocumentGuard(session.dirty);
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await provider.update("romiku_quotes", {
        id: record.id,
        data: quoteHeaderWrite(session.values),
        previousData: record,
      });
      await commitCommercialItems(
        provider,
        "quote",
        String(record.id),
        session.savedItems,
        session.items,
      );
      await items.refetch();
      session.commit(result.data, session.items);
      await onSaved();
      setMessage("报价单已保存。");
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="max-w-6xl space-y-4">
      <Link
        to="/quotes"
        className="underline"
        onClick={(event) => {
          if (confirmDiscard()) return;
          event.preventDefault();
        }}
      >
        返回报价单
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">
          {record.document_number || "草稿报价单"}
        </h1>
        {session.editing ? (
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              保存
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={session.cancel}
            >
              取消
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={session.start}>
            编辑
          </Button>
        )}
      </div>
      <SourceLinks record={record} />
      <DocumentConversion source="quote" sourceId={String(record.id)} />
      <p className="text-muted-foreground text-sm">
        保留来源链接；报价单修改仅应用于此单据。
      </p>
      <DocumentHeaderSummary
        kind="quote"
        editable={session.editing}
        values={session.values}
        onChange={session.setValues}
        customers={customers.data}
      />
      {items.error ? (
        <p role="alert">
          无法加载报价单产品项或合计。{" "}
          <Button variant="outline" onClick={() => items.refetch()}>
            重试
          </Button>
        </p>
      ) : items.isPending ? (
        <p>正在加载合计…</p>
      ) : (
        <DocumentFinancialSummary
          editable={session.editing}
          items={session.items}
          values={session.values}
          onChange={session.setValues}
        />
      )}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">产品项</TabsTrigger>
          <TabsTrigger value="buyer">采购方与详情</TabsTrigger>
          <TabsTrigger value="terms">条款与费用</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          {items.data && (
            <CommercialLineItemsTable
              kind="quote"
              documentId={String(record.id)}
              items={session.items}
              currency={String(session.values.currency)}
              documentLanguage={
                session.values.document_language === "en" ||
                session.values.document_language === "es"
                  ? session.values.document_language
                  : "zh"
              }
              onChanged={items.refetch}
              editable={session.editing}
              onItemsChange={session.setItems}
            />
          )}
        </TabsContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <TabsContent value="buyer">
            <fieldset disabled={busy || !session.editing} className="space-y-4">
              <WorkflowFields
                fields={buyerFields}
                values={session.values}
                onChange={session.setValues}
              />
            </fieldset>
          </TabsContent>
          <TabsContent value="terms">
            <fieldset disabled={busy || !session.editing} className="space-y-4">
              <WorkflowFields
                fields={termsFields}
                values={session.values}
                onChange={session.setValues}
              />
            </fieldset>
          </TabsContent>
          {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </form>
      </Tabs>
    </section>
  );
}

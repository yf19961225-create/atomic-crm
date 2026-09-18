import { useState } from "react";
import { Link, useParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { quoteHeaderWrite, quoteStatuses, quoteTotals } from "./quoteWorkflow";
import { QuoteItems } from "./QuoteItems";
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
  { key: "currency", label: "币种", required: true },
  { key: "document_date", label: "单据日期（YYYY-MM-DD）" },
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
  { key: "freight", label: "运费" },
  { key: "other_expenses", label: "其他费用" },
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
  const [values, setValues] = useState<Values>(record);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const items = useQuery({
    queryKey: ["quote-items", record.id],
    queryFn: () =>
      readRelated(provider, "romiku_quote_items", { quote_id: record.id }),
  });
  const totals = quoteTotals(items.data || [], record);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await provider.update("romiku_quotes", {
        id: record.id,
        data: quoteHeaderWrite(values),
        previousData: record,
      });
      setValues(result.data);
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
      <Link to="/quotes" className="underline">
        返回报价单
      </Link>
      <h1 className="text-3xl font-semibold">
        {record.document_number || "草稿报价单"}
      </h1>
      <SourceLinks record={record} />
      <DocumentConversion source="quote" sourceId={String(record.id)} />
      <p className="text-muted-foreground text-sm">
        保留来源链接；报价单修改仅应用于此单据。
      </p>
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
        <div className="bg-muted flex flex-wrap gap-6 rounded p-4">
          <span>
            小计：{record.currency} {totals.subtotal.toFixed(2)}
          </span>
          <span>运费：{Number(record.freight || 0).toFixed(2)}</span>
          <span>其他费用：{Number(record.other_expenses || 0).toFixed(2)}</span>
          <span>折扣：{Number(record.discount || 0).toFixed(2)}</span>
          <strong>
            合计：{record.currency} {totals.total.toFixed(2)}
          </strong>
          <span className="text-muted-foreground text-xs">已保存的值</span>
        </div>
      )}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">产品项</TabsTrigger>
          <TabsTrigger value="buyer">采购方与详情</TabsTrigger>
          <TabsTrigger value="terms">条款与费用</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          {items.data && (
            <QuoteItems
              quoteId={String(record.id)}
              items={items.data}
              onChanged={items.refetch}
            />
          )}
        </TabsContent>
        <form onSubmit={save} className="space-y-4">
          <TabsContent value="buyer">
            <fieldset disabled={busy} className="space-y-4">
              <WorkflowFields
                fields={buyerFields}
                values={values}
                onChange={setValues}
              />
              <Button type="submit" disabled={busy}>
                保存报价单
              </Button>
            </fieldset>
          </TabsContent>
          <TabsContent value="terms">
            <fieldset disabled={busy} className="space-y-4">
              <WorkflowFields
                fields={termsFields}
                values={values}
                onChange={setValues}
              />
              <Button type="submit" disabled={busy}>
                保存报价单
              </Button>
            </fieldset>
          </TabsContent>
          {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </form>
      </Tabs>
    </section>
  );
}

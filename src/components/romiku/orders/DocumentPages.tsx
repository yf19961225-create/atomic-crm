import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { errorMessage } from "../outbound/RelatedRecords";
import { CommercialLineItemsTable } from "../commercial/CommercialLineItemsTable";
import { DepositBalanceSummary } from "../commercial/DepositBalanceSummary";
import { DocumentFinancialSummary } from "../commercial/DocumentFinancialSummary";
import { DocumentHeaderSummary } from "../commercial/DocumentHeaderSummary";
import { FormalCustomerSelector } from "../commercial/FormalCustomerSelector";
import {
  commitCommercialItems,
  readCommercialItems,
} from "../commercial/commercialLineItems";
import {
  useDocumentEditSession,
  useUnsavedDocumentGuard,
} from "../commercial/useDocumentEditSession";
import { quoteTotals } from "../quotes/quoteWorkflow";
import { OrderPayments } from "../payments/OrderPayments";
import { DocumentConversion } from "./DocumentConversion";
import {
  createDocument,
  documentConfig,
  documentHeaderWrite,
  type DocumentKind,
} from "./documentWorkflow";
import {
  documentStatusChoices,
  documentStatusLabel,
} from "../commercialLabels";
import { InlineStatusSelect } from "../shared/InlineStatusSelect";

function DocumentSources({ record }: { record: RaRecord }) {
  const links = [
    [record.source_quote_id, "/quotes/", "报价单"],
    [record.source_pi_id, "/pi/", "PI"],
    [
      record.source_website_inquiry_id,
      "/website-inquiries?record=",
      "网站询盘",
    ],
    [record.outbound_company_id, "/outbound-development?record=", "主动开发"],
    [record.formal_customer_id, "/formal-customers?record=", "正式客户"],
  ].filter(([id]) => id);
  return (
    <div className="flex gap-3 text-sm">
      {links.length ? (
        links.map(([id, path, label]) => (
          <Link
            key={label}
            className="underline"
            to={`${path}${encodeURIComponent(id)}`}
          >
            {label}
          </Link>
        ))
      ) : (
        <span>直接创建</span>
      )}
    </div>
  );
}
export function DocumentList({ kind }: { kind: DocumentKind }) {
  const config = documentConfig[kind];
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const {
    data = [],
    total,
    isPending,
    error,
    refetch,
  } = useGetList(config.totals, {
    pagination: { page, perPage: 25 },
    sort: { field: "created_at", order: "DESC" },
    filter: {
      ...(search ? { "document_number@ilike": `%${search}%` } : {}),
      ...(status ? { status } : {}),
    },
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{config.plural}</h1>
        <Button asChild>
          <Link to={`${config.path}/new`}>新建{config.label}</Link>
        </Button>
      </div>
      <p className="text-muted-foreground">
        独立保存采购方、产品和商务快照，并保留来源历史。
      </p>
      <div className="flex gap-4">
        <label>
          单据编号{" "}
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
            {config.statuses.map((status) => (
              <option value={status} key={status}>
                {documentStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending && <p>正在加载{config.plural}…</p>}
      {error && (
        <p role="alert">
          无法加载{config.plural}。{" "}
          <Button onClick={() => refetch()}>重试</Button>
        </p>
      )}
      <div className="overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                config.label,
                "采购方",
                "来源",
                "状态",
                "日期",
                "合计",
                ...(kind === "order" ? ["待收款"] : []),
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((record) => (
              <tr className="border-t" key={record.id}>
                <td className="p-3">
                  <Link
                    className="underline"
                    to={`${config.path}/${record.id}`}
                  >
                    {record.document_number}
                  </Link>
                </td>
                <td className="p-3">{record.counterparty_snapshot?.name}</td>
                <td className="p-3">
                  <DocumentSources record={record} />
                </td>
                <td className="p-3">
                  <InlineStatusSelect
                    resource={config.resource}
                    recordId={String(record.id)}
                    status={String(record.status || config.statuses[0] || "")}
                    choices={config.statuses.map((value) => ({
                      value,
                      label: documentStatusLabel(value),
                    }))}
                    label={`${config.label}状态`}
                  />
                </td>
                <td className="p-3">{record.document_date}</td>
                <td className="p-3">
                  {record.currency} {Number(record.total).toFixed(2)}
                </td>
                {kind === "order" && (
                  <td className="p-3">
                    {record.currency}{" "}
                    {Number(record.remaining_amount).toFixed(2)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !error && !data.length && (
          <p className="p-6 text-center">未找到{config.plural}。</p>
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
          第 {page} 页{total !== undefined && ` · 共 ${total} 条`}
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
export function DocumentCreate({ kind }: { kind: DocumentKind }) {
  const config = documentConfig[kind],
    provider = useDataProvider(),
    navigate = useNavigate();
  const [values, setValues] = useState<Values>({ name: "" }),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [customer, setCustomer] = useState<{
    formalCustomerId: string;
    snapshot: Record<string, unknown>;
  } | null>(null);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      const { data } = await createDocument(
        provider,
        kind,
        String(values.name || ""),
        customer || undefined,
      );
      navigate(`${config.path}/${data.id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-3xl space-y-4">
      <Link className="underline" to={config.path}>
        返回{config.plural}
      </Link>
      <h1 className="text-3xl font-semibold">新建{config.label}</h1>
      <p>
        直接创建{config.label}。如需复制已有单据，请打开其详情页并使用“创建
        {config.label}”。
      </p>
      <form className="space-y-4" onSubmit={create}>
        <fieldset disabled={busy} className="space-y-4">
          <WorkflowFields
            fields={[{ key: "name", label: "采购方名称", required: true }]}
            values={values}
            onChange={setValues}
          />
          <label className="flex max-w-sm flex-col gap-1">
            正式客户（可选）
            <FormalCustomerSelector
              value={customer?.formalCustomerId}
              onSelect={({ formalCustomerId, snapshot }) => {
                if (!formalCustomerId || !snapshot) return setCustomer(null);
                setCustomer({ formalCustomerId, snapshot });
                setValues({ ...values, name: snapshot.name });
              }}
            />
          </label>
          <Button type="submit">创建{config.label}</Button>
        </fieldset>
        {failure && <p role="alert">{failure}</p>}
      </form>
    </section>
  );
}
export function DocumentDetail({ kind }: { kind: DocumentKind }) {
  const { id = "" } = useParams(),
    config = documentConfig[kind];
  const { data, isPending, error, refetch } = useGetOne(config.resource, {
    id,
  });
  if (isPending) return <p>正在加载{config.label}…</p>;
  if (error || !data)
    return (
      <p role="alert">
        无法加载此{config.label}。{" "}
        <Link className="underline" to={config.path}>
          返回{config.plural}
        </Link>
      </p>
    );
  return (
    <DocumentEditor
      key={`${kind}:${id}`}
      kind={kind}
      record={data}
      onSaved={refetch}
    />
  );
}
const buyerFields: Field[] = [
  { key: "counterparty_snapshot.name", label: "采购方名称", required: true },
  { key: "counterparty_snapshot.company", label: "公司名称" },
  { key: "counterparty_snapshot.contact", label: "联系人姓名" },
  { key: "counterparty_snapshot.email", label: "邮箱", type: "email" },
  { key: "counterparty_snapshot.phone", label: "电话" },
  { key: "counterparty_snapshot.whatsapp", label: "WhatsApp" },
  { key: "counterparty_snapshot.country", label: "国家/地区" },
  {
    key: "counterparty_snapshot.address",
    label: "采购方地址",
    type: "textarea",
  },
  { key: "counterparty_snapshot.consignee", label: "收货人" },
  {
    key: "counterparty_snapshot.consignee_contact",
    label: "收货联系人",
  },
  {
    key: "counterparty_snapshot.shipping_address",
    label: "收货地址",
    type: "textarea",
  },
  {
    key: "counterparty_snapshot.billing_address",
    label: "账单地址",
    type: "textarea",
  },
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
  {
    key: "terms_snapshot.clauses",
    label: "商务条款",
    type: "textarea",
  },
  { key: "bank_snapshot.details", label: "银行信息", type: "textarea" },
  { key: "discount", label: "折扣" },
  { key: "deposit_due_at", label: "定金到期日（ISO / 时区）" },
  { key: "balance_due_at", label: "尾款到期日（ISO / 时区）" },
];
function DocumentEditor({
  kind,
  record,
  onSaved,
}: {
  kind: DocumentKind;
  record: RaRecord;
  onSaved: () => Promise<unknown>;
}) {
  const config = documentConfig[kind],
    provider = useDataProvider();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const items = useQuery({
    queryKey: [`${kind}-items`, record.id],
    queryFn: () => readCommercialItems(provider, kind, String(record.id)),
  });
  const session = useDocumentEditSession(record, items.data);
  const confirmDiscard = useUnsavedDocumentGuard(session.dirty);
  const totals = quoteTotals(session.items, session.values);
  async function save() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await provider.update(config.resource, {
        id: record.id,
        data: documentHeaderWrite(kind, session.values),
        previousData: record,
      });
      await commitCommercialItems(
        provider,
        kind,
        String(record.id),
        session.savedItems,
        session.items,
      );
      await items.refetch();
      session.commit(result.data, session.items);
      await onSaved();
      setMessage(`${config.label}已保存。`);
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const details: Field[] = [
    ...buyerFields,
    {
      key: "status",
      label: `${config.label}状态`,
      choices: documentStatusChoices.filter(({ id }) =>
        config.statuses.includes(id),
      ),
      required: true,
    },
    ...(kind === "pi"
      ? [
          {
            key: "terms_snapshot.valid_until",
            label: "有效期至（YYYY-MM-DD）",
          },
        ]
      : [{ key: "purchase_order_number", label: "客户 PO 编号" }]),
  ];
  const delivery: Field[] =
    kind === "order"
      ? [
          {
            key: "expected_delivery_at",
            label: "预计交付（ISO / 时区）",
          },
          {
            key: "actual_delivery_at",
            label: "实际交付（ISO / 时区）",
          },
        ]
      : [
          {
            key: "terms_snapshot.expected_delivery",
            label: "预计交付（YYYY-MM-DD）",
          },
        ];
  const tabs = [
    { name: "采购方与详情", fields: details },
    { name: "条款与费用", fields: termsFields },
    {
      name: "交付与备注",
      fields: [
        ...delivery,
        {
          key: "notes",
          label: `${config.label}备注`,
          type: "textarea" as const,
        },
      ],
    },
  ];
  return (
    <section className="max-w-6xl space-y-4">
      <Link
        className="underline"
        to={config.path}
        onClick={(event) => {
          if (confirmDiscard()) return;
          event.preventDefault();
        }}
      >
        返回{config.plural}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">
          {record.document_number || `草稿${config.label}`}
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
      <DocumentSources record={record} />
      {kind === "order" && (
        <div className="flex gap-4">
          <Link className="underline" to={`/production?order=${record.id}`}>
            生产单
          </Link>
          <Link
            className="underline"
            to={`/packing-shipping?order=${record.id}`}
          >
            装箱单
          </Link>
        </div>
      )}
      {kind === "pi" && (
        <DocumentConversion source="pi" sourceId={String(record.id)} />
      )}
      <p className="text-muted-foreground text-sm">
        修改仅应用于此{config.label}的快照；来源单据保留原始值。
      </p>
      <DocumentHeaderSummary
        kind={kind}
        editable={session.editing}
        values={session.values}
        onChange={session.setValues}
      />
      {items.error ? (
        <p role="alert">
          无法加载产品项或合计。{" "}
          <Button onClick={() => items.refetch()}>重试</Button>
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
      {!items.error && !items.isPending && (
        <DepositBalanceSummary
          editable={session.editing}
          total={totals.total}
          currency={String(session.values.currency || "USD")}
          values={session.values}
          onChange={session.setValues}
        />
      )}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="items">产品项</TabsTrigger>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.name} value={tab.name}>
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="items">
          {items.data && (
            <CommercialLineItemsTable
              kind={kind}
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
          {kind === "order" && items.data && (
            <section className="space-y-3 pt-4">
              <h2 className="text-xl font-semibold">订单收款</h2>
              <OrderPayments
                order={record}
                total={totals.total}
                editable={!session.editing}
              />
            </section>
          )}
        </TabsContent>
        {tabs.map((tab) => (
          <TabsContent key={tab.name} value={tab.name}>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset
                disabled={busy || !session.editing}
                className="space-y-4"
              >
                <WorkflowFields
                  fields={tab.fields}
                  values={session.values}
                  onChange={session.setValues}
                />
              </fieldset>
            </form>
          </TabsContent>
        ))}
      </Tabs>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    </section>
  );
}

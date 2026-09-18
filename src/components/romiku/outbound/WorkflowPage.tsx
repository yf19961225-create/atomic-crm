import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  useDataProvider,
  useGetList,
  useGetOne,
  useRefresh,
  type RaRecord,
} from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkflowFields,
  labelFor,
  type Field,
  type Values,
} from "./WorkflowFields";
import {
  Contacts,
  Followups,
  errorMessage,
  formatDate,
  useRelated,
} from "./RelatedRecords";
import {
  deriveFollowupState,
  readRelated,
  saveWorkflowRecord,
  workflowResources,
  type Followup,
  type WorkflowKind,
} from "./workflow";
import { relationshipStatusLabel } from "../relationshipLabels";

export type WorkflowConfig = {
  kind: WorkflowKind;
  title: string;
  createLabel?: string;
  statuses: string[];
  fields: Field[];
  extraTabs?: {
    title: string;
    fields?: Field[];
    render?: (record: RaRecord) => React.ReactNode;
  }[];
};

function FollowupCells({
  record,
  kind,
}: {
  record: RaRecord;
  kind: "inquiry" | "outbound";
}) {
  const { data, error } = useRelated(
    kind === "inquiry"
      ? "romiku_website_inquiry_followups"
      : "romiku_outbound_followups",
    kind === "inquiry" ? "inquiry_id" : "outbound_company_id",
    record.id,
  );
  if (!data)
    return (
      <td colSpan={4} className="p-3">
        {error ? "无法加载跟进数据" : "正在加载…"}
      </td>
    );
  const state = deriveFollowupState(data as Followup[], record.status);
  return (
    <>
      <td className="p-3">{formatDate(state.last_contact_at)}</td>
      <td className="p-3">{formatDate(state.next_follow_up_at)}</td>
      <td className="p-3">{state.follow_up_count}</td>
      <td className="p-3">{state.overdue ? "已逾期" : "—"}</td>
    </>
  );
}
function ContactCell({
  record,
  kind,
}: {
  record: RaRecord;
  kind: "outbound" | "customer";
}) {
  const {
    data = [],
    error,
    isPending,
  } = useRelated(
    kind === "outbound"
      ? "romiku_outbound_contacts"
      : "romiku_customer_contacts",
    kind === "outbound" ? "outbound_company_id" : "formal_customer_id",
    record.id,
  );
  const primary =
    data.find((contact) => contact.is_primary && contact.is_active !== false) ||
    data.find((contact) => contact.is_active !== false);
  return (
    <td className="p-3">
      {isPending ? (
        "正在加载…"
      ) : error ? (
        "无法加载联系人"
      ) : (
        <>
          {primary?.name || "—"}
          {data.length > 1 && ` (+${data.length - 1})`}
          <div className="text-muted-foreground text-xs">
            {primary?.whatsapp}
          </div>
        </>
      )}
    </td>
  );
}
export function WorkflowPage({ config }: { config: WorkflowConfig }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("record");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const resource = workflowResources[config.kind];
  const nameKey = config.kind === "inquiry" ? "customer_name" : "name";
  const {
    data = [],
    total,
    isPending,
    error,
    refetch,
  } = useGetList(resource, {
    pagination: { page, perPage: 25 },
    sort: {
      field: config.kind === "inquiry" ? "submitted_at" : "name",
      order: config.kind === "inquiry" ? "DESC" : "ASC",
    },
    filter: {
      ...(status ? { status } : {}),
      ...(search ? { [`${nameKey}@ilike`]: `%${search}%` } : {}),
    },
  });
  const provider = useDataProvider();
  const owners = useQuery({
    queryKey: ["romiku-owners"],
    queryFn: () => readRelated(provider, "sales", {}),
  });
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("record", id);
    else next.delete("record");
    setParams(next);
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{config.title}</h1>
        {config.createLabel && (
          <Button onClick={() => open("new")}>{config.createLabel}</Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        {config.kind === "inquiry"
          ? "每条网站提交均独立保存，原始信息只读。"
          : config.kind === "outbound"
            ? "调研和外贸开发与网站询盘、正式客户相互独立。"
            : "实际业务建立后，请手动创建客户档案。"}{" "}
        状态变更需手动操作。
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          搜索{" "}
          <input
            aria-label="搜索"
            className="rounded border p-2"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          筛选状态{" "}
          <select
            aria-label="筛选状态"
            className="rounded border p-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            {config.statuses.map((value) => (
              <option key={value} value={value}>
                {labelFor(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending && <p>正在加载记录…</p>}
      {error && (
        <div role="alert">
          无法加载记录。{" "}
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                config.kind === "inquiry" ? "询盘／客户" : "公司",
                "国家／地区",
                ...(config.kind === "inquiry"
                  ? ["提交时间", "电子邮箱"]
                  : ["主要联系人"]),
                ...(config.kind === "outbound"
                  ? ["品牌", "采购品类", "价值等级"]
                  : []),
                "状态",
                "负责人",
                ...(config.kind !== "customer"
                  ? ["最近联系", "下次跟进", "跟进次数", "到期状态"]
                  : []),
              ].map((title) => (
                <th className="whitespace-nowrap p-3 font-medium" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((record) => (
              <tr key={record.id} className="hover:bg-muted/50 border-t">
                <td className="p-3">
                  <button
                    className="text-primary text-left font-medium underline underline-offset-4"
                    onClick={() => open(String(record.id))}
                  >
                    {config.kind === "inquiry"
                      ? `${record.document_number} · ${record.customer_name}`
                      : record.name}
                  </button>
                </td>
                <td className="p-3">{record.country || "—"}</td>
                {config.kind === "inquiry" ? (
                  <>
                    <td className="p-3">{formatDate(record.submitted_at)}</td>
                    <td className="p-3">{record.email}</td>
                  </>
                ) : (
                  <ContactCell record={record} kind={config.kind} />
                )}
                {config.kind === "outbound" && (
                  <>
                    <td className="p-3">{record.brand_name}</td>
                    <td className="p-3">
                      {record.purchasing_categories?.join(", ")}
                    </td>
                    <td className="p-3">{record.grade}</td>
                  </>
                )}
                <td className="p-3">
                  {relationshipStatusLabel(record.status)}
                </td>
                <td className="p-3">
                  {record.owner_id
                    ? owners.data?.find(
                        (owner) => owner.user_id === record.owner_id,
                      )?.first_name || "已分配"
                    : "未分配"}
                </td>
                {config.kind !== "customer" && (
                  <FollowupCells record={record} kind={config.kind} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !error && data.length === 0 && (
          <p className="p-6 text-center text-sm">未找到记录。</p>
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
          第 {page} 页{total !== undefined && ` · 共 ${total} 条记录`}
        </span>
        <Button
          variant="outline"
          disabled={total !== undefined ? page * 25 >= total : data.length < 25}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>
      <Sheet
        open={!!selected}
        onOpenChange={(isOpen) => {
          if (!isOpen) open(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>
              {selected === "new" ? config.createLabel : config.title}
            </SheetTitle>
            <SheetDescription>
              手动更新会保留每条记录的身份和历史。
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            {selected && (
              <WorkflowDrawer
                key={selected}
                config={config}
                id={selected}
                onCreated={open}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function WorkflowDrawer({
  config,
  id,
  onCreated,
}: {
  config: WorkflowConfig;
  id: string;
  onCreated: (id: string) => void;
}) {
  const { data, isPending, error } = useGetOne(
    workflowResources[config.kind],
    { id },
    { enabled: id !== "new" },
  );
  if (id === "new")
    return config.createLabel ? (
      <RecordEditor config={config} onCreated={onCreated} />
    ) : (
      <p>网站询盘会从网站自动进入。</p>
    );
  if (isPending) return <p>正在加载记录…</p>;
  if (error || !data) return <p role="alert">无法加载此记录。</p>;
  return <RecordEditor config={config} record={data} onCreated={onCreated} />;
}
function RecordEditor({
  config,
  record,
  onCreated,
}: {
  config: WorkflowConfig;
  record?: RaRecord;
  onCreated: (id: string) => void;
}) {
  const provider = useDataProvider();
  const refresh = useRefresh();
  const [values, setValues] = useState<Values>(
    record
      ? {
          ...record,
          purchasing_categories: record.purchasing_categories?.join(", "),
        }
      : { status: config.statuses[0] },
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [activeTab, setActiveTab] = useState("档案");
  const editingRecord =
    activeTab === "档案" ||
    config.extraTabs?.some((tab) => tab.title === activeTab && tab.fields);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const write = { ...values };
      if (config.kind === "outbound")
        write.purchasing_categories = String(values.purchasing_categories || "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      const result = await saveWorkflowRecord(
        provider,
        config.kind,
        write,
        record,
      );
      refresh();
      setMessage("记录已保存。");
      if (!record) onCreated(String(result.data.id));
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      {record && (
        <Button asChild variant="outline">
          <Link
            to={`/quotes/new?source=${config.kind}&sourceId=${encodeURIComponent(record.id)}`}
          >
            新建报价单
          </Link>
        </Button>
      )}
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="档案">档案</TabsTrigger>
        {config.extraTabs?.map((tab) => (
          <TabsTrigger key={tab.title} value={tab.title}>
            {tab.title}
          </TabsTrigger>
        ))}
        {record && config.kind !== "inquiry" && (
          <TabsTrigger value="联系人">联系人</TabsTrigger>
        )}
        {record && config.kind !== "customer" && (
          <TabsTrigger value="跟进">跟进</TabsTrigger>
        )}
      </TabsList>
      <form onSubmit={submit} className="space-y-4" hidden={!editingRecord}>
        <TabsContent value="档案" className="space-y-4">
          <WorkflowFields
            fields={config.fields}
            values={values}
            onChange={setValues}
          />
          {record && config.kind === "inquiry" && (
            <p className="text-sm">
              {record.customer_name} · {record.company} · {record.email}
            </p>
          )}
          {config.kind === "customer" && (
            <p className="text-muted-foreground text-sm">
              来源关联仅用于查看历史；关联不会移动、合并或转换来源记录。
            </p>
          )}
        </TabsContent>
        {config.extraTabs
          ?.filter((tab) => tab.fields)
          .map((tab) => (
            <TabsContent key={tab.title} value={tab.title}>
              <WorkflowFields
                fields={tab.fields!}
                values={values}
                onChange={setValues}
              />
            </TabsContent>
          ))}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "正在保存…" : "保存记录"}
          </Button>
          {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </div>
      </form>
      {config.extraTabs
        ?.filter((tab) => tab.render)
        .map((tab) => (
          <TabsContent key={tab.title} value={tab.title}>
            {record ? tab.render?.(record) : <p>请先保存此记录。</p>}
          </TabsContent>
        ))}
      {record && config.kind !== "inquiry" && (
        <TabsContent value="联系人">
          <Contacts kind={config.kind} id={record.id} />
        </TabsContent>
      )}
      {record && config.kind !== "customer" && (
        <TabsContent value="跟进">
          <Followups kind={config.kind} id={record.id} />
        </TabsContent>
      )}
      {record && config.kind === "customer" && (
        <p className="text-sm">
          <Link className="underline" to="/website-inquiries">
            打开网站询盘以手动关联来源历史
          </Link>
        </p>
      )}
    </Tabs>
  );
}

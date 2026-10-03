import { MarkingProfileEditor } from "../marking/MarkingProfileEditor";
import { RecordDelete } from "../shared/RecordDelete";
import { useModuleSearch } from "../search/useBusinessSearch";
import { SearchInput } from "../search/SearchInput";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useDataProvider, useGetList, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { errorMessage } from "../outbound/RelatedRecords";
import { readRelated } from "../outbound/workflow";
import { fulfillmentConfig, type FulfillmentKind } from "./fulfillmentShared";
import { FulfillmentItems } from "./FulfillmentItems";
import { PackingItemsGrid } from "../packing/PackingItemsGrid";
import { PackingExportDetails } from "../packing/PackingExportDetails";
import { normalizePackingExportModel } from "../packing/packingExportModel";
import { renderPackingXlsx } from "../packing/packingXlsxRenderer";
import { productionStatusChoices } from "../commercialLabels";
import { InlineStatusSelect } from "../shared/InlineStatusSelect";
import { normalizeProductionExportModel } from "./productionExportModel";
import { renderProductionXlsx } from "./productionXlsxRenderer";
import { hydrateProductionMarkingImages } from "../marking/markingAssets";
import productionTemplateUrl from "@/assets/production-templates/ROMIKU生产单模板.xlsx?url";
import packingTemplateUrl from "@/assets/packing-templates/ROMIKU_装箱单_模板.xlsx?url";

function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

const localDateTimeLabel = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
};

export function FulfillmentList({ kind }: { kind: FulfillmentKind }) {
  const config = fulfillmentConfig[kind],
    [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const orderId = params.get("order");
  const searchResult = useModuleSearch(
    kind,
    config.resource,
    search,
    page,
    orderId ? { order_id: orderId } : {},
  );
  const ordinary = useGetList(
    config.resource,
    {
      pagination: { page, perPage: 25 },
      sort: { field: "created_at", order: "DESC" },
      filter: orderId ? { order_id: orderId } : {},
    },
    { enabled: !search.trim() },
  );
  const query = searchResult.active
    ? { ...searchResult, total: searchResult.group?.total_count }
    : ordinary;
  return (
    <section className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-3xl font-semibold">{config.plural}</h1>
        <Button asChild>
          <Link
            to={`${config.path}/new${orderId ? `?order=${encodeURIComponent(orderId)}` : ""}`}
          >
            新建{config.label}
          </Link>
        </Button>
      </div>
      <SearchInput
        label={`搜索${config.plural}`}
        value={search}
        onChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
      />
      {orderId && (
        <p>
          订单：{" "}
          <Link className="underline" to={`/orders/${orderId}`}>
            {orderId}
          </Link>{" "}
          ·{" "}
          <Link className="underline" to={config.path}>
            全部记录
          </Link>
        </p>
      )}
      {query.isPending && <p>正在加载{config.plural}…</p>}
      {query.error && (
        <p role="alert">
          无法加载记录。 <Button onClick={() => query.refetch()}>重试</Button>
        </p>
      )}
      <div className="overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "单据",
                "订单",
                ...(kind === "production"
                  ? ["状态", "工厂交期", "生成时间"]
                  : ["批次", "装箱日期", "唛头"]),
              ].map((title) => (
                <th className="p-3" key={title}>
                  {title}
                </th>
              ))}
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.map((record) => (
              <tr key={record.id} className="border-t">
                <td className="p-3">
                  <Link
                    className="underline"
                    to={`${config.path}/${record.id}`}
                  >
                    {record.document_number || record.id}
                  </Link>
                </td>
                <td className="p-3">
                  <Link className="underline" to={`/orders/${record.order_id}`}>
                    {record.order_id}
                  </Link>
                </td>
                {(kind === "production"
                  ? [
                      <InlineStatusSelect
                        resource={config.resource}
                        recordId={String(record.id)}
                        status={String(record.status || "pending")}
                        choices={productionStatusChoices.map(
                          ({ id, label }) => ({
                            value: id,
                            label,
                          }),
                        )}
                        label="生产状态"
                      />,
                      record.factory_due_at,
                      localDateTimeLabel(record.created_at),
                    ]
                  : [
                      record.batch_label,
                      record.packing_at,
                      record.shipping_mark,
                    ]
                ).map((value, i) => (
                  <td className="p-3" key={i}>
                    {value || "—"}
                  </td>
                ))}
                {(kind === "packing" || kind === "production") && (
                  <td className="p-3">
                    <RecordDelete
                      kind={kind}
                      id={String(record.id)}
                      label={String(
                        record.document_number || record.name || record.id,
                      )}
                      onDeleted={() => {
                        if (query.data?.length === 1 && page > 1)
                          setPage(page - 1);
                      }}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {query.data?.length === 0 && <p className="p-6">未找到记录。</p>}
      </div>
      <div className="flex gap-3">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          上一页
        </Button>
        <span>
          第 {page} 页{query.total !== undefined && ` · 共 ${query.total} 条`}
        </span>
        <Button
          disabled={
            query.total !== undefined
              ? page * 25 >= query.total
              : (query.data?.length || 0) < 25
          }
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
}
export function FulfillmentDetail({ kind }: { kind: FulfillmentKind }) {
  const { id = "" } = useParams(),
    config = fulfillmentConfig[kind];
  const query = useGetOne(config.resource, { id });
  if (query.isPending) return <p>正在加载{config.label}…</p>;
  if (query.error || !query.data)
    return (
      <p role="alert">
        无法加载{config.label}。{" "}
        <Button onClick={() => query.refetch()}>重试</Button>
      </p>
    );
  return (
    <FulfillmentEditor
      key={`${kind}:${id}`}
      kind={kind}
      record={query.data}
      onSaved={query.refetch}
    />
  );
}
const productionFields: Field[] = [
  { key: "document_number", label: "单据编号", required: true },
  { key: "name", label: "生产名称" },
  {
    key: "status",
    label: "生产状态",
    required: true,
    choices: productionStatusChoices,
  },
  { key: "factory_due_at", label: "工厂交期（ISO / 时区）" },
  { key: "anomaly_notes", label: "异常备注", type: "textarea" },
  { key: "notes", label: "生产备注", type: "textarea" },
];
const packingFields: Field[] = [
  { key: "name", label: "装箱名称" },
  { key: "batch_label", label: "批次" },
  { key: "packing_at", label: "装箱日期（ISO / 时区）" },
  { key: "shipping_mark", label: "装箱单唛头" },
  { key: "notes", label: "装箱备注", type: "textarea" },
];
function FulfillmentEditor({
  kind,
  record,
  onSaved,
}: {
  kind: FulfillmentKind;
  record: RaRecord;
  onSaved: () => Promise<unknown>;
}) {
  const provider = useDataProvider(),
    config = fulfillmentConfig[kind];
  const [values, setValues] = useState<Values>(record),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [failure, setFailure] = useState(""),
    [saved, setSaved] = useState(false);
  const items = useQuery({
    queryKey: ["fulfillment-items", kind, record.id],
    queryFn: () =>
      readRelated(provider, config.items, { [config.foreignKey]: record.id }),
  });
  const fields = kind === "production" ? productionFields : packingFields;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setSaved(false);
    try {
      const data = Object.fromEntries([
        ...fields.map(({ key }) => [key, values[key] || null]),
        ...(kind === "packing"
          ? [
              ["seller_snapshot", values.seller_snapshot || {}],
              ["buyer_snapshot", values.buyer_snapshot || {}],
            ]
          : []),
      ]);
      const dateKey = kind === "production" ? "factory_due_at" : "packing_at";
      if (data[dateKey]) {
        const date = new Date(String(data[dateKey]));
        if (!Number.isFinite(date.getTime()))
          throw new Error("请输入有效日期。");
        data[dateKey] = date.toISOString();
      }
      const result = await provider.update(config.resource, {
        id: record.id,
        data,
        previousData: record,
      });
      setValues(result.data);
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function exportProductionXlsx() {
    if (kind !== "production") return;
    setExporting(true);
    setFailure("");
    try {
      const [saved, savedItems, template] = await Promise.all([
        provider.getOne("romiku_production_orders", { id: record.id }),
        readRelated(provider, "romiku_production_items", {
          production_order_id: record.id,
        }),
        fetch(productionTemplateUrl).then((response) => {
          if (!response.ok) throw new Error("无法加载生产单 XLSX 模板。");
          return response.arrayBuffer();
        }),
      ]);
      const model = await hydrateProductionMarkingImages(
        normalizeProductionExportModel(saved.data, savedItems),
      );
      const xlsx = await renderProductionXlsx(model, template);
      download(
        xlsx,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `${model.document.number || "PRODUCTION"}.xlsx`,
      );
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }
  async function exportPackingXlsx() {
    if (kind !== "packing" || !items.data) return;
    setExporting(true);
    setFailure("");
    try {
      const template = await fetch(packingTemplateUrl).then((response) => {
        if (!response.ok) throw new Error("无法加载装箱单 XLSX 模板。");
        return response.arrayBuffer();
      });
      const model = normalizePackingExportModel(record, items.data);
      const xlsx = await renderPackingXlsx(model, template);
      download(
        xlsx,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `${model.document.number || "PACKING-LIST"}.xlsx`,
      );
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="w-full min-w-0 space-y-5">
      <Link className="underline" to={config.path}>
        返回{config.plural}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">
          {record.document_number || config.label}
        </h1>
        <RecordDelete
          kind={kind}
          id={String(record.id)}
          label={String(record.document_number || config.label)}
          redirectTo={config.path}
          disabled={busy || exporting}
        />
      </div>

      {kind === "packing" && !record.order_id ? (
        <p>独立装箱单：未关联订单。</p>
      ) : (
        <p>
          来源订单：{" "}
          <Link className="underline" to={`/orders/${record.order_id}`}>
            {record.order_id}
          </Link>
        </p>
      )}
      {kind === "production" && (
        <p>生成时间：{localDateTimeLabel(record.created_at)}</p>
      )}
      <details>
        <summary className="cursor-pointer">{config.label}详情</summary>
        <form className="space-y-4 py-4" onSubmit={save}>
          <fieldset disabled={busy} className="space-y-4">
            <WorkflowFields
              fields={fields}
              values={values}
              onChange={setValues}
            />
            <Button type="submit">保存{config.label}</Button>
          </fieldset>
        </form>
      </details>
      {kind === "production" && (
        <>
          <MarkingProfileEditor kind="production" record={record} />
          <Button
            type="button"
            variant="outline"
            disabled={!items.data || busy || exporting}
            onClick={exportProductionXlsx}
          >
            {exporting ? "正在导出生产单…" : "导出 Production XLSX"}
          </Button>
        </>
      )}
      {failure && <p role="alert">{failure}</p>}
      {saved && <p role="status">{config.label}已保存。</p>}
      {kind === "packing" && (
        <div className="flex flex-wrap gap-2">
          <PackingExportDetails
            values={values}
            editable={!busy && !exporting}
            onChange={setValues}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!items.data || exporting}
            onClick={exportPackingXlsx}
          >
            导出 Packing XLSX
          </Button>
        </div>
      )}
      {items.error ? (
        <p role="alert">
          无法加载产品项。 <Button onClick={() => items.refetch()}>重试</Button>
        </p>
      ) : items.isPending ? (
        <p>正在加载产品项…</p>
      ) : kind === "packing" ? (
        <PackingItemsGrid
          parent={record}
          items={items.data}
          onSaved={items.refetch}
        />
      ) : (
        <FulfillmentItems
          kind={kind}
          parent={record}
          items={items.data}
          onChanged={items.refetch}
        />
      )}
    </section>
  );
}

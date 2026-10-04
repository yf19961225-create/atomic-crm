import { ProductionNavigationGuard } from "./ProductionNavigationGuard";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RecordDelete } from "../shared/RecordDelete";
import { readRelated } from "../outbound/workflow";
import {
  productionStatusChoices,
  productionStatusLabel,
} from "../commercialLabels";
import {
  InstructionUploadContext,
  validateLabels,
} from "../marking/InstructionLabelsEditor";
import {
  copyOrderProductionInstructions,
  normalizeProductionInstructions,
  normalizeItemMarkingOverride,
  ITEM_XLSX_WARNING,
} from "../marking/productionInstructions";
import {
  itemLabelSummary,
  productionSuffix,
  savedBuyerName,
  saveProductionWorkspace,
  workspaceExpected,
} from "./productionWorkspace";
import {
  ProductionInstructionsFields,
  ResolvedItemInstructions,
  SharedInstructionsSummary,
  ItemOverrideFields,
} from "./ProductionInstructionsFields";

export function ProductionWorkbench({
  record,
  items,
  order,
  isNew = false,
  onCancel,
  onSaved,
  onExport,
  exporting = false,
}: {
  record: RaRecord;
  items: RaRecord[];
  order: RaRecord;
  isNew?: boolean;
  onCancel?: () => void;
  onSaved: () => Promise<unknown>;
  onExport?: () => void;
  exporting?: boolean;
}) {
  const inFlight = useRef(false);
  const committed = useRef(false);
  const provider = useDataProvider(),
    cache = useQueryClient(),
    navigate = useNavigate();
  const [draft, setDraft] = useState(() => structuredClone(record)),
    [lines, setLines] = useState(() => structuredClone(items));
  const [base, setBase] = useState(() => workspaceExpected(record, items));
  const [editing, setEditing] = useState(isNew),
    [busy, setBusy] = useState(false),
    [uploads, setUploads] = useState(0),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState("");
  const [special, setSpecial] = useState<string | null>(null),
    [confirmReload, setConfirmReload] = useState(false),
    [overAssigned, setOverAssigned] = useState("");
  const source = useQuery({
    queryKey: ["production-source-items", order.id],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", { order_id: order.id }),
    enabled: editing,
  });
  const profile = normalizeProductionInstructions(draft.marking_snapshot),
    disabled = busy || uploads > 0;
  const dirty =
    editing &&
    (isNew ||
      JSON.stringify(draft) !== JSON.stringify(record) ||
      JSON.stringify(lines) !== JSON.stringify(items));
  function start() {
    committed.current = false;
    setDraft(structuredClone(record));
    setLines(structuredClone(items));
    setBase(workspaceExpected(record, items));
    setEditing(true);
    setFailure("");
    setMessage("");
  }
  function cancel() {
    if (isNew) {
      onCancel?.();
      return;
    }
    setDraft(structuredClone(record));
    setLines(structuredClone(items));
    setEditing(false);
    setSpecial(null);
    setConfirmReload(false);
    setOverAssigned("");
    setFailure("");
  }
  function change(id: RaRecord["id"], patch: Partial<RaRecord>) {
    setLines((rows) => rows.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setOverAssigned("");
  }
  async function save(allow = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      validateLabels(
        [profile.front_mark, profile.side_mark, profile.small_label].map(
          (m, i) => ({ ...m, id: String(i), type: "common" }),
        ),
      );
      validateLabels(profile.additional_labels);
      for (const line of lines) {
        const own = normalizeItemMarkingOverride(line.marking_override);
        if (own.mode !== "inherit") validateLabels(own.labels);
        if (own.mode === "replace")
          validateLabels(
            [own.front_mark, own.side_mark].map((m, i) => ({
              ...m,
              id: String(i),
              type: "mark",
            })),
          );
      }
      const result = await saveProductionWorkspace(
        { ...draft, marking_snapshot: profile },
        lines,
        isNew ? { order_updated_at: order.updated_at } : base,
        isNew,
        allow,
      );
      if (!result.ok) {
        if (result.code === "OVER_ASSIGNED")
          setOverAssigned(result.message || "生产数量超过订单数量。");
        else setFailure(result.message || "保存失败。");
        return;
      }
      committed.current = true;
      setEditing(false);
      setSpecial(null);
      setOverAssigned("");
      await cache.invalidateQueries();
      await onSaved();
      setMessage("整张生产单已保存。");
      if (isNew) navigate(`/production/${result.id}`, { replace: true });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const visible = editing ? lines : items,
    shownProfile = editing
      ? profile
      : normalizeProductionInstructions(record.marking_snapshot);
  return (
    <InstructionUploadContext.Provider
      value={(active) => setUploads((n) => Math.max(0, n + (active ? 1 : -1)))}
    >
      <section className="space-y-5">
        <ProductionNavigationGuard
          active={dirty || disabled}
          busy={disabled}
          committed={committed}
        />
        <Link className="underline" to="/production">
          返回生产管理
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p>
              所属订单：
              <Link className="underline" to={`/orders/${order.id}`}>
                {order.document_number || "订单编号未填写"}
              </Link>
            </p>
            <h1 className="text-3xl font-semibold">
              ↳{" "}
              {isNew
                ? "新建生产单"
                : productionSuffix(
                    record.document_number,
                    order.document_number,
                  )}
            </h1>
            <p>客户：{savedBuyerName(order)}</p>
            {!isNew && (
              <p className="text-muted-foreground text-sm">
                {record.document_number} ·{" "}
                {productionStatusLabel(record.status)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button disabled={disabled} onClick={() => void save()}>
                  保存
                </Button>
                <Button variant="outline" disabled={disabled} onClick={cancel}>
                  取消
                </Button>
              </>
            ) : (
              <Button disabled={busy} onClick={start}>
                编辑
              </Button>
            )}
            {!isNew && (
              <RecordDelete
                kind="production"
                id={String(record.id)}
                label={String(record.document_number || "生产单")}
                redirectTo="/production"
                disabled={editing || exporting || busy}
              />
            )}
          </div>
        </div>
        {failure && <p role="alert">{failure}</p>}
        {message && <p role="status">{message}</p>}
        {uploads > 0 && <p role="status">正在上传图片，请等待完成后保存。</p>}
        <fieldset disabled={disabled} className="space-y-5">
          <section className="space-y-4 rounded border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="text-xl font-semibold">统一生产要求</h2>
              {!editing && (
                <Button variant="outline" onClick={start}>
                  修改本生产单
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              来源：{order.document_number} ·{" "}
              {shownProfile.source.kind === "order"
                ? "已从订单生产要求继承；本生产单独立保存"
                : "本生产单已保存要求"}
              。修改订单不会自动覆盖已创建生产单。
            </p>
            {editing ? (
              <>
                <ProductionInstructionsFields
                  value={profile}
                  onChange={(marking_snapshot) => {
                    setDraft((d) => ({ ...d, marking_snapshot }));
                    setOverAssigned("");
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => setConfirmReload(true)}
                >
                  重新载入订单默认值
                </Button>
                {confirmReload && (
                  <div role="alertdialog" aria-label="确认重新载入订单默认值">
                    <p>
                      载入当前已保存的订单要求到编辑草稿，保留所有产品例外；点击整单保存后生效。
                    </p>
                    <Button
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const { data } = await provider.getOne(
                            "romiku_orders",
                            { id: order.id },
                          );
                          setDraft((d) => ({
                            ...d,
                            marking_snapshot:
                              copyOrderProductionInstructions(data),
                          }));
                          setConfirmReload(false);
                        } catch {
                          setFailure("无法读取订单默认值。");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      确认载入草稿
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmReload(false)}
                    >
                      取消载入
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <SharedInstructionsSummary value={shownProfile} />
            )}
          </section>
          {editing && (
            <details>
              <summary>生产单详情</summary>
              <div className="grid gap-3 py-3 md:grid-cols-2">
                {[
                  "document_number",
                  "name",
                  "factory_due_at",
                  "notes",
                  "anomaly_notes",
                ]
                  .filter((k) => !isNew || k !== "document_number")
                  .map((k) => (
                    <label className="block" key={k}>
                      {
                        (
                          {
                            document_number: "单据编号",
                            name: "生产名称",
                            factory_due_at: "工厂交期（ISO / 时区）",
                            notes: "生产备注",
                            anomaly_notes: "异常备注",
                          } as Record<string, string>
                        )[k]
                      }
                      <input
                        className="block w-full rounded border p-2"
                        aria-label={
                          k === "document_number" ? "单据编号" : `生产详情 ${k}`
                        }
                        value={draft[k] || ""}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [k]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                <label>
                  生产状态
                  <select
                    aria-label="生产状态"
                    className="ml-2 rounded border p-2"
                    value={draft.status || "pending"}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, status: e.target.value }))
                    }
                  >
                    {productionStatusChoices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          )}
          <h2 className="text-xl font-semibold">所有产品</h2>
          <p className="text-sm text-amber-800">
            {ITEM_XLSX_WARNING}。附加统一标签及内部备注仍仅保存在 CRM。
          </p>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "SKU",
                    "产品",
                    "图片",
                    "产品规格",
                    "箱数",
                    "装箱数",
                    "总数量",
                    "标签状态",
                    "操作",
                  ].map((s) => (
                    <th key={s} className="p-3">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => {
                  const own = normalizeItemMarkingOverride(
                      line.marking_override,
                    ),
                    packaging = line.packaging_snapshot || {};
                  const input = (
                    key: string,
                    label: string,
                    value: unknown,
                    onChange: (v: string) => void,
                    numeric = false,
                  ) =>
                    editing ? (
                      <input
                        type={numeric ? "number" : "text"}
                        step={numeric ? "any" : undefined}
                        min={
                          numeric
                            ? key === "quantity"
                              ? "0.0001"
                              : "0"
                            : undefined
                        }
                        className="w-28 rounded border p-2"
                        aria-label={`${label} ${line.sku}`}
                        value={value == null ? "" : String(value)}
                        onChange={(e) => onChange(e.target.value)}
                      />
                    ) : (
                      <span>
                        {value == null || value === "" ? "—" : String(value)}
                      </span>
                    );
                  return (
                    <tr key={line.id} className="border-t align-top">
                      <td className="p-3">{line.sku}</td>
                      <td className="p-3">
                        {input(
                          "name",
                          "产品名称",
                          line.product_snapshot?.name,
                          (v) =>
                            change(line.id, {
                              product_snapshot: {
                                ...line.product_snapshot,
                                name: v,
                              },
                            }),
                        )}
                      </td>
                      <td className="p-3">
                        {line.product_snapshot?.image_url ? (
                          <img
                            className="size-16 object-contain"
                            alt={line.sku}
                            src={line.product_snapshot.image_url}
                          />
                        ) : (
                          "—"
                        )}
                        {editing && (
                          <details>
                            <summary>图片 URL</summary>
                            {input(
                              "image_url",
                              "产品图片",
                              line.product_snapshot?.image_url,
                              (v) =>
                                change(line.id, {
                                  product_snapshot: {
                                    ...line.product_snapshot,
                                    image_url: v,
                                  },
                                }),
                            )}
                          </details>
                        )}
                      </td>
                      <td className="p-3">
                        {input(
                          "specification",
                          "产品规格",
                          line.product_snapshot?.specification,
                          (v) =>
                            change(line.id, {
                              product_snapshot: {
                                ...line.product_snapshot,
                                specification: v,
                              },
                            }),
                        )}
                        {editing && (
                          <details>
                            <summary>生产备注</summary>
                            <textarea
                              aria-label={`生产备注 ${line.sku}`}
                              value={line.production_note_zh || ""}
                              onChange={(e) =>
                                change(line.id, {
                                  production_note_zh: e.target.value,
                                })
                              }
                            />
                          </details>
                        )}
                        {!editing && line.production_note_zh && (
                          <p>{line.production_note_zh}</p>
                        )}
                      </td>
                      <td className="p-3">
                        {input(
                          "cartons",
                          "箱数",
                          packaging.cartons ?? packaging.carton_qty,
                          (v) =>
                            change(line.id, {
                              packaging_snapshot: { ...packaging, cartons: v },
                            }),
                          true,
                        )}
                      </td>
                      <td className="p-3">
                        {input(
                          "qty_per_carton",
                          "装箱数",
                          packaging.qty_per_carton,
                          (v) =>
                            change(line.id, {
                              packaging_snapshot: {
                                ...packaging,
                                qty_per_carton: v,
                              },
                            }),
                          true,
                        )}
                      </td>
                      <td className="p-3">
                        {input(
                          "quantity",
                          "总数量",
                          line.quantity,
                          (v) => change(line.id, { quantity: v }),
                          true,
                        )}
                        {editing &&
                          Number(packaging.cartons) > 0 &&
                          Number(packaging.qty_per_carton) > 0 &&
                          Number(packaging.cartons) *
                            Number(packaging.qty_per_carton) !==
                            Number(line.quantity) && (
                            <p className="max-w-36 text-xs text-amber-800">
                              总数量与箱数 ×
                              装箱数不一致；仍可按本次生产数量保存。
                            </p>
                          )}
                      </td>
                      <td className="p-3">
                        <p>
                          {itemLabelSummary(shownProfile, own) ||
                            (own.mode === "inherit"
                              ? "使用统一要求"
                              : "已设置特殊要求")}
                        </p>
                        {itemLabelSummary(shownProfile, own) && (
                          <p className="text-muted-foreground text-xs">
                            {own.mode === "inherit"
                              ? "使用统一要求"
                              : own.mode === "append"
                                ? "额外增加"
                                : "产品独立要求"}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setSpecial((s) =>
                              s === String(line.id) ? null : String(line.id),
                            )
                          }
                        >
                          特殊要求 {line.sku}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible
            .filter((i) => String(i.id) === special)
            .map((line) => (
              <section key={line.id} className="rounded border p-4 space-y-3">
                <h3>{line.sku} · 特殊要求</h3>
                {editing ? (
                  <ItemOverrideFields
                    value={line.marking_override}
                    onChange={(marking_override) =>
                      change(line.id, { marking_override })
                    }
                  />
                ) : (
                  <>
                    <ResolvedItemInstructions
                      common={shownProfile}
                      override={line.marking_override}
                    />
                    <Button onClick={start}>编辑整张生产单</Button>
                  </>
                )}
              </section>
            ))}
          {editing && (
            <label className="block">
              从所属订单添加产品
              <select
                aria-label="从所属订单添加产品"
                className="ml-2 rounded border p-2"
                value=""
                disabled={!source.data}
                onChange={(e) => {
                  const s = source.data?.find(
                    (i) => String(i.id) === e.target.value,
                  );
                  if (s)
                    setLines((rows) => [
                      ...rows,
                      {
                        id: crypto.randomUUID(),
                        isNew: true,
                        source_order_item_id: s.id,
                        sku: s.sku,
                        quantity: s.quantity,
                        product_snapshot: structuredClone(
                          s.product_snapshot || {},
                        ),
                        packaging_snapshot: structuredClone(
                          s.packing_snapshot || {},
                        ),
                        marking_override: { mode: "inherit" },
                      },
                    ]);
                }}
              >
                <option value="">选择产品</option>
                {source.data
                  ?.filter(
                    (i) => !lines.some((l) => l.source_order_item_id === i.id),
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} · {i.product_snapshot?.name}
                    </option>
                  ))}
              </select>
              {source.error && (
                <span role="alert">无法加载订单产品，请稍后重试。</span>
              )}
            </label>
          )}
          {overAssigned && (
            <div
              role="alertdialog"
              aria-label="确认超出订单数量"
              className="rounded border p-4"
            >
              <p>{overAssigned}</p>
              <Button onClick={() => void save(true)}>确认超量并保存</Button>
              <Button variant="outline" onClick={() => setOverAssigned("")}>
                返回修改
              </Button>
            </div>
          )}
        </fieldset>
        {!isNew && onExport && (
          <Button
            variant="outline"
            disabled={editing || exporting || disabled}
            onClick={onExport}
          >
            {exporting ? "正在导出生产单…" : "导出 Production XLSX"}
          </Button>
        )}
      </section>
    </InstructionUploadContext.Provider>
  );
}

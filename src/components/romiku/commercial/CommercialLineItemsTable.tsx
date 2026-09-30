import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useDataProvider } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  ProductLibraryLookup,
  type DocumentLanguage,
} from "./ProductLibraryLookup";
import { CommercialItemDrawer } from "./CommercialItemDrawer";
import {
  calculateQuoteUsdUnitPrice,
  parseQuoteSourceCnyUnitPrice,
  parseQuoteUsdUnitPrice,
} from "../quotes/quoteWorkflow";
import {
  commercialItemAdapter,
  clearProductIdentityForManualSku,
  cartonCbmFromPacking,
  newDraftCommercialItemId,
  lineAmount,
  nextPositions,
  quantityFromPacking,
  reorderCommercialItems,
  type CommercialDocumentKind,
  type CommercialItem,
} from "./commercialLineItems";

export function CommercialLineItemsTable({
  kind,
  documentId,
  items,
  currency,
  documentLanguage = "zh",
  onChanged,
  editable = true,
  onItemsChange,
  quoteFxEnabled = false,
  quoteFxRate,
}: {
  kind: CommercialDocumentKind;
  documentId: string;
  items: CommercialItem[];
  currency: string;
  documentLanguage?: DocumentLanguage;
  onChanged: () => Promise<unknown>;
  editable?: boolean;
  /** When supplied, edits stay in the document session until its Save. */
  onItemsChange?: (items: CommercialItem[]) => void;
  quoteFxEnabled?: boolean;
  quoteFxRate?: unknown;
}) {
  const compactQuote = kind === "quote";
  const quoteFxActive = compactQuote && quoteFxEnabled;
  const orderTemplate = kind === "order";
  const provider = useDataProvider();
  const [showCustomerCode, setShowCustomerCode] = useState(
    kind !== "quote" && items.some((item) => Boolean(item.customer_code)),
  );
  const [drawer, setDrawer] = useState<CommercialItem | null>(null);
  // Keep a Quote CBM as the user's raw decimal text until blur. Converting on
  // every keystroke turns the valid intermediate value "0." into "0" and
  // makes decimals such as 0.08 impossible to type reliably.
  const [quoteCbmDrafts, setQuoteCbmDrafts] = useState<Record<string, string>>(
    {},
  );
  const [quoteCnyDrafts, setQuoteCnyDrafts] = useState<Record<string, string>>(
    {},
  );
  const [quoteUsdDrafts, setQuoteUsdDrafts] = useState<Record<string, string>>(
    {},
  );
  const [draftRows, setDraftRows] = useState(() =>
    Array.from({ length: 5 }, (_, id) => id),
  );
  const draftSkuRefs = useRef<Array<HTMLInputElement | null>>([]);
  const rowSkuRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowNameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const adapter = commercialItemAdapter(kind);
  const formatQuoteCbm = (packing: Record<string, unknown>) => {
    const value = cartonCbmFromPacking(packing);
    return value == null ? "" : value.toFixed(3);
  };
  const parseQuoteCbm = (value: string) => {
    const raw = value.trim();
    if (!raw) return null;
    if (!/^\d+(?:\.\d{1,3})?$/.test(raw)) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };
  const formatQuotePrice = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(4) : "";
  };
  const totals = useMemo(
    () =>
      items.reduce(
        (sum, item) => ({
          cartons:
            sum.cartons +
            Number(
              (item.packing_snapshot as Record<string, unknown>)?.cartons || 0,
            ),
          quantity: sum.quantity + Number(item.quantity || 0),
          subtotal: sum.subtotal + lineAmount(item.quantity, item.unit_price),
        }),
        { cartons: 0, quantity: 0, subtotal: 0 },
      ),
    [items],
  );
  const save = async (item: CommercialItem, data: Record<string, unknown>) => {
    if (onItemsChange) {
      onItemsChange(
        items.map((candidate) =>
          candidate.id === item.id ? { ...candidate, ...data } : candidate,
        ),
      );
      return;
    }
    await provider.update(adapter.resource, {
      id: item.id,
      data,
      previousData: item,
    });
    await onChanged();
  };
  const add = async () => {
    if (onItemsChange) {
      onItemsChange([
        ...items,
        {
          id: newDraftCommercialItemId(),
          sku: "MANUAL",
          quantity: 1,
          unit_price: 0,
          product_snapshot: {},
          packing_snapshot: {},
          position: items.length + 1,
        },
      ]);
      return;
    }
    await provider.create(adapter.resource, {
      data: {
        [adapter.parentKey]: documentId,
        sku: "MANUAL",
        quantity: 1,
        unit_price: 0,
        product_snapshot: {},
        packing_snapshot: {},
        position: items.length + 1,
      },
    });
    await onChanged();
  };
  const createDraft = async (
    draftIndex: number,
    data: Record<string, unknown>,
  ) => {
    if (onItemsChange) {
      onItemsChange([
        ...items,
        {
          id: newDraftCommercialItemId(),
          sku: "MANUAL",
          quantity: 1,
          unit_price: 0,
          product_snapshot: {},
          packing_snapshot: {},
          position: items.length + 1,
          ...data,
        },
      ]);
      setDraftRows((current) =>
        current.filter((id) => id !== draftRows[draftIndex]),
      );
      return;
    }
    await provider.create(adapter.resource, {
      data: {
        [adapter.parentKey]: documentId,
        sku: "MANUAL",
        quantity: 1,
        unit_price: 0,
        product_snapshot: {},
        packing_snapshot: {},
        position: items.length + 1,
        ...data,
      },
    });
    await onChanged();
    setDraftRows((current) =>
      current.filter((id) => id !== draftRows[draftIndex]),
    );
  };
  const advanceDraft = (draftIndex: number) => {
    if (draftIndex + 1 < draftRows.length)
      draftSkuRefs.current[draftIndex + 1]?.focus();
    else setDraftRows((current) => [...current, Math.max(-1, ...current) + 1]);
    if (draftIndex + 1 >= draftRows.length)
      setTimeout(() => draftSkuRefs.current[draftIndex + 1]?.focus(), 0);
  };
  const advanceRow = (index: number) => {
    const next = items[index + 1];
    if (next) rowSkuRefs.current[String(next.id)]?.focus();
    else draftSkuRefs.current[0]?.focus();
  };
  const copy = async (item: CommercialItem) => {
    const { id: _id, ...copyItem } = item;
    if (onItemsChange) {
      onItemsChange([
        ...items,
        {
          ...copyItem,
          id: newDraftCommercialItemId(),
          position: items.length + 1,
        },
      ]);
      return;
    }
    await provider.create(adapter.resource, {
      data: {
        ...copyItem,
        [adapter.parentKey]: documentId,
        position: items.length + 1,
      },
    });
    await onChanged();
  };
  const onDragEnd = async (result: DropResult) => {
    if (
      result.destination == null ||
      result.destination.index === result.source.index
    )
      return;
    if (onItemsChange) {
      const next = nextPositions(
        items,
        result.source.index,
        result.destination.index,
      );
      const byId = new Map(items.map((item) => [String(item.id), item]));
      onItemsChange(
        next.map(({ id, position }) => ({ ...byId.get(id)!, position })),
      );
      return;
    }
    try {
      await reorderCommercialItems(
        provider,
        kind,
        items,
        nextPositions(items, result.source.index, result.destination.index),
      );
      await onChanged();
    } catch {
      await onChanged();
    }
  };
  return (
    <section className="space-y-3 overflow-x-auto">
      {!orderTemplate && !compactQuote && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCustomerCode}
            disabled={!editable}
            onChange={(event) => setShowCustomerCode(event.target.checked)}
          />
          显示客户货号
        </label>
      )}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="commercial-lines">
          {(provided) => (
            <table
              className="w-full min-w-[1100px] text-sm"
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              <thead>
                <tr>
                  {(orderTemplate
                    ? [
                        "",
                        "No.",
                        "货号",
                        "产品名称",
                        "图片",
                        "产品规格",
                        "箱数",
                        "装箱数",
                        "总数量",
                        "单价",
                        "总金额",
                        "⋯",
                      ]
                    : compactQuote
                      ? [
                          "No.",
                          "货号",
                          "产品名称",
                          "图片",
                          "产品规格",
                          "装箱数",
                          ...(quoteFxActive
                            ? ["人民币单价", "单价(USD)"]
                            : ["单价"]),
                          "CBM",
                        ]
                      : [
                          "",
                          "序号",
                          "货号/SKU",
                          "产品名称",
                          "图片",
                          ...(showCustomerCode ? ["客户货号"] : []),
                          "描述与规格",
                          "Qty/Ctn",
                          "箱数",
                          "总数量",
                          "单价",
                          "金额",
                          "操作",
                        ]
                  ).map((header) => (
                    <th className="p-2 text-left" key={header}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const product = (item.product_snapshot ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const packing = (item.packing_snapshot ?? {}) as Record<
                    string,
                    unknown
                  >;
                  const updatePacking = async (key: string, value: unknown) => {
                    const nextPacking = { ...packing, [key]: value };
                    const quantity =
                      (key === "cartons" || key === "qty_per_carton") &&
                      !packing.quantity_manual
                        ? quantityFromPacking(nextPacking)
                        : item.quantity;
                    await save(item, {
                      packing_snapshot: nextPacking,
                      quantity,
                    });
                  };
                  const quoteCbmKey = String(item.id);
                  const quoteCnyKey = String(item.id);
                  const quoteUsdKey = String(item.id);
                  const commitQuoteCbm = async () => {
                    const current =
                      quoteCbmDrafts[quoteCbmKey] ?? formatQuoteCbm(packing);
                    const parsed = parseQuoteCbm(current);
                    if (parsed === undefined) {
                      setQuoteCbmDrafts((drafts) => ({
                        ...drafts,
                        [quoteCbmKey]: formatQuoteCbm(packing),
                      }));
                      return;
                    }
                    const formatted = parsed === null ? "" : parsed.toFixed(3);
                    setQuoteCbmDrafts((drafts) => ({
                      ...drafts,
                      [quoteCbmKey]: formatted,
                    }));
                    await updatePacking("carton_cbm", parsed);
                  };
                  const updateQuoteCnyPrice = async (raw: string) => {
                    const sourceCny = parseQuoteSourceCnyUnitPrice(raw);
                    let unitPrice = item.unit_price;
                    if (quoteFxActive) {
                      try {
                        unitPrice = calculateQuoteUsdUnitPrice(
                          raw,
                          quoteFxRate,
                        );
                      } catch {
                        // Keep the saved CNY source price until a valid rate arrives.
                      }
                    }
                    await save(item, {
                      source_cny_unit_price: sourceCny,
                      unit_price: unitPrice,
                    });
                  };
                  const commitQuoteCnyPrice = async () => {
                    const raw =
                      quoteCnyDrafts[quoteCnyKey] ??
                      formatQuotePrice(item.source_cny_unit_price);
                    try {
                      await updateQuoteCnyPrice(raw);
                      setQuoteCnyDrafts((drafts) => ({
                        ...drafts,
                        [quoteCnyKey]: formatQuotePrice(raw),
                      }));
                    } catch {
                      setQuoteCnyDrafts((drafts) => ({
                        ...drafts,
                        [quoteCnyKey]: formatQuotePrice(
                          item.source_cny_unit_price,
                        ),
                      }));
                    }
                  };
                  const updateQuoteUsdPrice = async (raw: string) => {
                    await save(item, {
                      unit_price: parseQuoteUsdUnitPrice(raw),
                    });
                  };
                  const commitQuoteUsdPrice = async () => {
                    const raw =
                      quoteUsdDrafts[quoteUsdKey] ??
                      formatQuotePrice(item.unit_price);
                    try {
                      await updateQuoteUsdPrice(raw);
                      setQuoteUsdDrafts((drafts) => ({
                        ...drafts,
                        [quoteUsdKey]: formatQuotePrice(raw),
                      }));
                    } catch {
                      setQuoteUsdDrafts((drafts) => ({
                        ...drafts,
                        [quoteUsdKey]: formatQuotePrice(item.unit_price),
                      }));
                    }
                  };
                  return (
                    <Draggable
                      draggableId={String(item.id)}
                      index={index}
                      key={item.id}
                      isDragDisabled={!editable}
                    >
                      {(drag) => (
                        <tr
                          className="border-t"
                          ref={drag.innerRef}
                          {...({
                            ...drag.draggableProps,
                            style: drag.draggableProps.style as CSSProperties,
                          } as HTMLAttributes<HTMLTableRowElement>)}
                        >
                          {!compactQuote && (
                            <td className="p-2" {...drag.dragHandleProps}>
                              ⠿
                            </td>
                          )}
                          <td {...(compactQuote ? drag.dragHandleProps : {})}>
                            {compactQuote && "⠿ "}
                            {index + 1}
                          </td>
                          <td className="p-1">
                            {editable ? (
                              <ProductLibraryLookup
                                sku={item.sku}
                                inputRef={(element) => {
                                  rowSkuRefs.current[String(item.id)] = element;
                                }}
                                specificationMode={
                                  kind === "quote" ? "machines-only" : "none"
                                }
                                captureQuotePacking={kind === "quote"}
                                documentLanguage={documentLanguage}
                                onSelected={(snapshot) => {
                                  void save(item, { ...snapshot });
                                  setTimeout(
                                    () =>
                                      rowNameRefs.current[
                                        String(item.id)
                                      ]?.focus(),
                                    0,
                                  );
                                }}
                                onManualSku={(sku) =>
                                  void save(
                                    item,
                                    clearProductIdentityForManualSku(item, sku),
                                  )
                                }
                              />
                            ) : (
                              <span>{item.sku}</span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-start gap-1">
                              <input
                                ref={(element) => {
                                  rowNameRefs.current[String(item.id)] =
                                    element;
                                }}
                                className="w-28 rounded border p-1"
                                value={String(product.name ?? "")}
                                disabled={!editable}
                                onChange={(event) => {
                                  if (!onItemsChange) return;
                                  void save(item, {
                                    product_snapshot: {
                                      ...product,
                                      name: event.target.value,
                                    },
                                  });
                                }}
                                onBlur={(event) => {
                                  if (onItemsChange) return;
                                  void save(item, {
                                    product_snapshot: {
                                      ...product,
                                      name: event.target.value,
                                    },
                                  });
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter")
                                    event.preventDefault();
                                }}
                              />
                              {compactQuote && editable && (
                                <details>
                                  <summary
                                    aria-label="行操作"
                                    className="cursor-pointer"
                                  >
                                    ⋯
                                  </summary>
                                  <div className="absolute z-10 space-y-1 rounded border bg-background p-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => void copy(item)}
                                    >
                                      复制行
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setDrawer(item)}
                                    >
                                      更多详情
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        onItemsChange
                                          ? onItemsChange(
                                              items.filter(
                                                (candidate) =>
                                                  candidate.id !== item.id,
                                              ),
                                            )
                                          : void provider
                                              .delete(adapter.resource, {
                                                id: item.id,
                                                previousData: item,
                                              })
                                              .then(onChanged)
                                      }
                                    >
                                      删除行
                                    </Button>
                                  </div>
                                </details>
                              )}
                            </div>
                          </td>
                          <td>
                            {product.image_url ? (
                              <img
                                className="h-9 w-9 object-cover"
                                src={String(product.image_url)}
                                alt=""
                              />
                            ) : (
                              "暂无图片"
                            )}
                          </td>
                          {orderTemplate && (
                            <td>
                              <textarea
                                aria-label="描述与规格"
                                className="min-h-8 w-40 resize-y rounded border p-1"
                                value={String(product.specification ?? "")}
                                disabled={!editable}
                                onChange={(event) =>
                                  onItemsChange &&
                                  void save(item, {
                                    product_snapshot: {
                                      ...product,
                                      specification: event.target.value,
                                    },
                                  })
                                }
                                onBlur={(event) =>
                                  !onItemsChange &&
                                  void save(item, {
                                    product_snapshot: {
                                      ...product,
                                      specification: event.target.value,
                                    },
                                  })
                                }
                              />
                            </td>
                          )}
                          {showCustomerCode &&
                            !orderTemplate &&
                            !compactQuote && (
                              <td>
                                <input
                                  className="w-24 rounded border p-1"
                                  value={String(item.customer_code ?? "")}
                                  disabled={!editable}
                                  onChange={(event) => {
                                    if (onItemsChange)
                                      void save(item, {
                                        customer_code: event.target.value,
                                      });
                                  }}
                                  onBlur={(event) => {
                                    if (!onItemsChange)
                                      void save(item, {
                                        customer_code: event.target.value,
                                      });
                                  }}
                                />
                              </td>
                            )}
                          {!orderTemplate && (
                            <td>
                              <textarea
                                aria-label="描述与规格"
                                className="min-h-8 w-40 resize-y rounded border p-1"
                                value={String(product.specification ?? "")}
                                disabled={!editable}
                                onChange={(event) => {
                                  if (onItemsChange)
                                    void save(item, {
                                      product_snapshot: {
                                        ...product,
                                        specification: event.target.value,
                                      },
                                    });
                                }}
                                onBlur={(event) => {
                                  if (!onItemsChange)
                                    void save(item, {
                                      product_snapshot: {
                                        ...product,
                                        specification: event.target.value,
                                      },
                                    });
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter")
                                    event.preventDefault();
                                }}
                              />
                            </td>
                          )}
                          {orderTemplate && (
                            <td>
                              <input
                                className="w-16 rounded border p-1"
                                type="number"
                                value={String(packing.cartons ?? "")}
                                disabled={!editable}
                                onChange={(event) =>
                                  onItemsChange &&
                                  void updatePacking(
                                    "cartons",
                                    event.target.value,
                                  )
                                }
                                onBlur={(event) =>
                                  !onItemsChange &&
                                  void updatePacking(
                                    "cartons",
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                          )}
                          <td>
                            <input
                              aria-label={compactQuote ? "Qty/Ctn" : undefined}
                              className="w-16 rounded border p-1"
                              type="number"
                              min={compactQuote ? "1" : undefined}
                              step={compactQuote ? "1" : undefined}
                              value={String(packing.qty_per_carton ?? "")}
                              disabled={!editable}
                              onChange={(event) => {
                                if (onItemsChange)
                                  void updatePacking(
                                    "qty_per_carton",
                                    event.target.value,
                                  );
                              }}
                              onBlur={(event) => {
                                if (!onItemsChange)
                                  void updatePacking(
                                    "qty_per_carton",
                                    event.target.value,
                                  );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter")
                                  event.preventDefault();
                              }}
                            />
                          </td>
                          {!compactQuote && !orderTemplate && (
                            <td>
                              <input
                                className="w-16 rounded border p-1"
                                type="number"
                                value={String(packing.cartons ?? "")}
                                disabled={!editable}
                                onChange={(event) => {
                                  if (onItemsChange)
                                    void updatePacking(
                                      "cartons",
                                      event.target.value,
                                    );
                                }}
                                onBlur={(event) => {
                                  if (!onItemsChange)
                                    void updatePacking(
                                      "cartons",
                                      event.target.value,
                                    );
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter")
                                    event.preventDefault();
                                }}
                              />
                            </td>
                          )}
                          {!compactQuote && (
                            <td>
                              <input
                                className="w-20 rounded border p-1"
                                type="number"
                                value={String(item.quantity)}
                                disabled={!editable}
                                onChange={(event) => {
                                  if (onItemsChange)
                                    void save(item, {
                                      quantity: Number(event.target.value),
                                      packing_snapshot: {
                                        ...packing,
                                        quantity_manual: true,
                                      },
                                    });
                                }}
                                onBlur={(event) => {
                                  if (!onItemsChange)
                                    void save(item, {
                                      quantity: Number(event.target.value),
                                      packing_snapshot: {
                                        ...packing,
                                        quantity_manual: true,
                                      },
                                    });
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter")
                                    event.preventDefault();
                                }}
                              />
                            </td>
                          )}
                          {quoteFxActive ? (
                            <>
                              <td>
                                <input
                                  aria-label="人民币单价"
                                  className="w-24 rounded border p-1"
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  inputMode="decimal"
                                  value={
                                    quoteCnyDrafts[quoteCnyKey] ??
                                    formatQuotePrice(item.source_cny_unit_price)
                                  }
                                  disabled={!editable}
                                  onChange={(event) => {
                                    const raw = event.target.value;
                                    setQuoteCnyDrafts((drafts) => ({
                                      ...drafts,
                                      [quoteCnyKey]: raw,
                                    }));
                                    try {
                                      parseQuoteSourceCnyUnitPrice(raw);
                                      void updateQuoteCnyPrice(raw);
                                    } catch {
                                      // Preserve a valid partial decimal draft.
                                    }
                                  }}
                                  onBlur={() => void commitQuoteCnyPrice()}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label="单价(USD)"
                                  className="w-24 rounded border p-1"
                                  readOnly
                                  value={formatQuotePrice(item.unit_price)}
                                />
                              </td>
                            </>
                          ) : (
                            <td>
                              <input
                                aria-label={compactQuote ? "单价" : undefined}
                                className="w-20 rounded border p-1"
                                type="number"
                                min={compactQuote ? "0" : undefined}
                                step={compactQuote ? "0.0001" : "0.01"}
                                inputMode={compactQuote ? "decimal" : undefined}
                                value={
                                  compactQuote
                                    ? (quoteUsdDrafts[quoteUsdKey] ??
                                      formatQuotePrice(item.unit_price))
                                    : String(item.unit_price)
                                }
                                disabled={!editable}
                                onChange={(event) => {
                                  if (compactQuote) {
                                    const raw = event.target.value;
                                    setQuoteUsdDrafts((drafts) => ({
                                      ...drafts,
                                      [quoteUsdKey]: raw,
                                    }));
                                    try {
                                      parseQuoteUsdUnitPrice(raw);
                                      void updateQuoteUsdPrice(raw);
                                    } catch {
                                      // Preserve a valid partial decimal draft.
                                    }
                                  } else if (onItemsChange)
                                    void save(item, {
                                      unit_price: Number(event.target.value),
                                    });
                                }}
                                onBlur={(event) => {
                                  if (compactQuote) void commitQuoteUsdPrice();
                                  else if (!onItemsChange)
                                    void save(item, {
                                      unit_price: Number(event.target.value),
                                    });
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    advanceRow(index);
                                  } else if (
                                    event.key === "Tab" &&
                                    !event.shiftKey
                                  ) {
                                    event.preventDefault();
                                    advanceRow(index);
                                  }
                                }}
                              />
                            </td>
                          )}
                          {compactQuote && (
                            <td>
                              <input
                                aria-label="CBM"
                                className="w-20 rounded border p-1"
                                type="number"
                                min="0"
                                step="0.001"
                                inputMode="decimal"
                                value={
                                  quoteCbmDrafts[quoteCbmKey] ??
                                  formatQuoteCbm(packing)
                                }
                                disabled={!editable}
                                onChange={(event) =>
                                  setQuoteCbmDrafts((drafts) => ({
                                    ...drafts,
                                    [quoteCbmKey]: event.target.value,
                                  }))
                                }
                                onBlur={() => void commitQuoteCbm()}
                              />
                            </td>
                          )}
                          {!compactQuote && (
                            <td>
                              {currency}{" "}
                              {lineAmount(
                                item.quantity,
                                item.unit_price,
                              ).toFixed(2)}
                            </td>
                          )}
                          {!compactQuote && (
                            <td>
                              {editable && (
                                <details>
                                  <summary
                                    aria-label="行操作"
                                    className="cursor-pointer"
                                  >
                                    ⋯
                                  </summary>
                                  <div className="absolute z-10 space-y-1 rounded border bg-background p-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => void copy(item)}
                                    >
                                      复制行
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setDrawer(item)}
                                    >
                                      更多详情
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        onItemsChange
                                          ? onItemsChange(
                                              items.filter(
                                                (candidate) =>
                                                  candidate.id !== item.id,
                                              ),
                                            )
                                          : void provider
                                              .delete(adapter.resource, {
                                                id: item.id,
                                                previousData: item,
                                              })
                                              .then(onChanged)
                                      }
                                    >
                                      删除行
                                    </Button>
                                  </div>
                                </details>
                              )}
                            </td>
                          )}
                        </tr>
                      )}
                    </Draggable>
                  );
                })}
                {editable &&
                  draftRows.map((draftId, draftIndex) => (
                    <tr
                      className="border-t bg-muted/20"
                      key={`draft-${draftId}`}
                    >
                      {!compactQuote && (
                        <td className="p-2 text-muted-foreground">—</td>
                      )}
                      <td className="text-muted-foreground">
                        {items.length + draftIndex + 1}
                      </td>
                      <td className="p-1">
                        <ProductLibraryLookup
                          specificationMode={
                            kind === "quote" ? "machines-only" : "none"
                          }
                          captureQuotePacking={kind === "quote"}
                          documentLanguage={documentLanguage}
                          inputRef={(element) => {
                            draftSkuRefs.current[draftIndex] = element;
                          }}
                          onSelected={(snapshot) =>
                            void createDraft(draftIndex, snapshot)
                          }
                          onManualSku={(sku) =>
                            void createDraft(draftIndex, { sku })
                          }
                        />
                      </td>
                      <td
                        colSpan={compactQuote ? 6 : showCustomerCode ? 10 : 9}
                      >
                        <input
                          aria-label={`草稿 SKU ${draftIndex + 1}`}
                          className="w-full bg-transparent p-1 text-muted-foreground"
                          placeholder="输入 SKU / 产品名称，或按 Enter 连续录入"
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            const sku = event.currentTarget.value.trim();
                            if (sku) void createDraft(draftIndex, { sku });
                            advanceDraft(draftIndex);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                {provided.placeholder}
              </tbody>
              {!compactQuote && (
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td colSpan={showCustomerCode ? 8 : 7}>汇总</td>
                    <td>{totals.cartons}</td>
                    <td></td>
                    <td>{totals.quantity}</td>
                    <td></td>
                    <td>
                      {currency} {totals.subtotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </Droppable>
      </DragDropContext>
      <Button type="button" disabled={!editable} onClick={() => void add()}>
        新增产品行
      </Button>
      <CommercialItemDrawer
        item={drawer}
        onClose={() => setDrawer(null)}
        onSave={(next) => {
          setDrawer(next);
          void save(next, {
            product_snapshot: next.product_snapshot,
            packing_snapshot: next.packing_snapshot,
            requirement: next.requirement,
            notes: next.notes,
          });
        }}
      />
    </section>
  );
}

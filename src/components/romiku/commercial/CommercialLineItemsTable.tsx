import { normalizeSpecificationDisplay } from "../quotes/normalizeSpecificationDisplay";
import { RequestedQuantity } from "../quotes/RequestedQuantity";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
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
import { ProductSnapshotImage } from "../products/ProductSnapshotImage";
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
  quantityFromPacking,
  reorderCommercialItems,
  type CommercialDocumentKind,
  type CommercialItem,
} from "./commercialLineItems";
import {
  commercialDisplayRows,
  nextCommercialPosition,
  orderedCommercialItems,
  reorderVisibleCommercialItems,
} from "./commercialLineDisplay";

export function CommercialLineItemsTable({
  kind,
  documentId,
  items,
  currency,
  documentLanguage = "zh",
  onChanged,
  editable = true,
  onItemsChange,
  onBlankRowsDirtyChange,
  quoteFxEnabled = false,
  quoteFxRate,
  websiteSourceQuote = false,
  orderCustomerCodeVisible = false,
  onOrderCustomerCodeVisibleChange,
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
  onBlankRowsDirtyChange?: (dirty: boolean) => void;
  quoteFxEnabled?: boolean;
  quoteFxRate?: unknown;
  websiteSourceQuote?: boolean;
  orderCustomerCodeVisible?: boolean;
  onOrderCustomerCodeVisibleChange?: (visible: boolean) => void;
}) {
  const compactQuote = kind === "quote";
  const quoteFxActive = compactQuote && quoteFxEnabled;
  const orderTemplate = kind === "order";
  const provider = useDataProvider();
  const [localShowCustomerCode, setLocalShowCustomerCode] = useState(
    kind !== "quote" && items.some((item) => Boolean(item.customer_code)),
  );
  const showCustomerCode = orderTemplate
    ? orderCustomerCodeVisible
    : localShowCustomerCode;
  const [drawer, setDrawer] = useState<CommercialItem | null>(null);
  // Keep a Quote CBM as the user's raw decimal text until blur. Converting on
  // every keystroke turns the valid intermediate value "0." into "0" and
  // makes decimals such as 0.08 impossible to type reliably.
  const [quoteSpecificationDrafts, setQuoteSpecificationDrafts] = useState<
    Record<string, string>
  >({});
  const [quoteCbmDrafts, setQuoteCbmDrafts] = useState<Record<string, string>>(
    {},
  );
  const [quoteCnyDrafts, setQuoteCnyDrafts] = useState<Record<string, string>>(
    {},
  );
  const [quoteUsdDrafts, setQuoteUsdDrafts] = useState<Record<string, string>>(
    {},
  );
  const [commercialPriceDrafts, setCommercialPriceDrafts] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    if (!editable) setCommercialPriceDrafts({});
  }, [editable]);
  const [blankId, setBlankId] = useState(0);
  const blankSkuRef = useRef<HTMLInputElement | null>(null);
  const nextPosition = () => nextCommercialPosition(items, []);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const rowSkuRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowNameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const adapter = commercialItemAdapter(kind);
  const visibleRows = commercialDisplayRows(
    items,
    editable ? [{ id: blankId, position: nextPosition() }] : [],
  );
  const orderedItems = orderedCommercialItems(items);
  useEffect(() => {
    if (!focusTarget) return;
    const element =
      focusTarget === "blank"
        ? blankSkuRef.current
        : focusTarget.startsWith("name:")
          ? rowNameRefs.current[focusTarget.slice(5)]
          : rowSkuRefs.current[focusTarget.slice(5)];
    if (!element) return;
    element.focus();
    pendingFocus.current = null;
    setFocusTarget(null);
  }, [focusTarget, blankId, items]);
  const requestFocus = (target: string) => {
    pendingFocus.current = target;
    setFocusTarget(target);
  };
  const isEntryKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return false;
    if (event.repeat || pendingFocus.current) {
      event.preventDefault();
      return false;
    }
    return true;
  };
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
    if (value === null || value === undefined || value === "") return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(4) : "";
  };
  const savedPriceText = (item: CommercialItem) =>
    item.unit_price_entered === false ? "" : String(item.unit_price);
  const savedQuotePriceText = (item: CommercialItem) =>
    item.unit_price_entered === false ? "" : formatQuotePrice(item.unit_price);
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
  const customerCodeCell = (item: CommercialItem) => (
    <td>
      <input
        aria-label={`客户货号 ${item.sku}`}
        className="min-w-0 w-full rounded border p-1"
        value={String(item.customer_code ?? "")}
        disabled={!editable}
        onChange={(event) => {
          if (onItemsChange)
            void save(item, { customer_code: event.target.value });
        }}
        onBlur={(event) => {
          if (!onItemsChange)
            void save(item, { customer_code: event.target.value });
        }}
      />
    </td>
  );
  const createDraft = async (
    data: Record<string, unknown>,
    focus?: "name" | "blank",
  ) => {
    const line = {
      sku: "MANUAL",
      quantity: 1,
      unit_price: 0,
      unit_price_entered: false,
      product_snapshot: {},
      packing_snapshot: {},
      position: nextPosition(),
      ...data,
    };
    let id;
    if (onItemsChange) {
      id = newDraftCommercialItemId();
      onItemsChange([...items, { ...line, id }]);
    } else {
      const created = await provider.create(adapter.resource, {
        data: { ...line, [adapter.parentKey]: documentId },
      });
      id = created.data.id;
      await onChanged();
    }
    onBlankRowsDirtyChange?.(false);
    setBlankId((current) => current + 1);
    if (focus) requestFocus(focus === "name" ? `name:${id}` : "blank");
  };
  const advanceRow = (index: number) => {
    const next = orderedItems[index + 1];
    requestFocus(next ? `item:${next.id}` : "blank");
  };
  const copy = async (item: CommercialItem) => {
    const { id: _id, ...copyItem } = item;
    if (onItemsChange) {
      onItemsChange([
        ...items,
        {
          ...copyItem,
          id: newDraftCommercialItemId(),
          position: nextPosition(),
        },
      ]);
      return;
    }
    await provider.create(adapter.resource, {
      data: {
        ...copyItem,
        [adapter.parentKey]: documentId,
        position: nextPosition(),
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
      const next = reorderVisibleCommercialItems(
        orderedItems,
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
        orderedItems,
        reorderVisibleCommercialItems(
          orderedItems,
          result.source.index,
          result.destination.index,
        ),
      );
      await onChanged();
    } catch {
      await onChanged();
    }
  };
  const columns: Array<[header: string, width: number]> = [];
  if (!compactQuote) columns.push(["", 30]);
  columns.push(
    [kind === "pi" ? "序号" : "No.", compactQuote ? 52 : 44],
    [kind === "pi" ? "货号/SKU" : "货号", 156],
  );
  if (orderTemplate && showCustomerCode) columns.push(["客户货号", 108]);
  columns.push(["产品名称", 152], ["图片", 64]);
  if (kind === "pi" && showCustomerCode) columns.push(["客户货号", 108]);
  columns.push([kind === "pi" ? "描述与规格" : "产品规格", 188]);
  const summaryLabelSpan = columns.length;
  if (orderTemplate) columns.push(["箱数", 68]);
  columns.push([kind === "pi" ? "Qty/Ctn" : "装箱数", 76]);
  if (kind === "pi") columns.push(["箱数", 68]);
  if (!compactQuote) columns.push(["总数量", 80]);
  if (quoteFxActive) columns.push(["人民币单价", 98]);
  columns.push([quoteFxActive ? "单价(USD)" : "单价", 96]);
  if (compactQuote) columns.push(["CBM", 86]);
  else
    columns.push(
      [orderTemplate ? "总金额" : "金额", 106],
      [orderTemplate ? "⋯" : "操作", 52],
    );
  const minWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  return (
    <section className="commercial-lines min-w-0 space-y-3">
      {!compactQuote && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCustomerCode}
            disabled={!editable}
            onChange={(event) =>
              orderTemplate
                ? onOrderCustomerCodeVisibleChange?.(event.target.checked)
                : setLocalShowCustomerCode(event.target.checked)
            }
          />
          显示客户货号
        </label>
      )}
      <div className="romiku-items-scroll">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="commercial-lines">
            {(provided) => (
              <table
                className="romiku-items-table w-full table-fixed text-sm"
                style={{ minWidth }}
              >
                <colgroup>
                  {columns.map(([header, width]) => (
                    <col
                      key={header}
                      style={{ width: `${(100 * width) / minWidth}%` }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map(([header], index) => (
                      <th
                        scope="col"
                        className={
                          index >= summaryLabelSpan &&
                          (compactQuote || index < columns.length - 1)
                            ? "p-2 text-right"
                            : "p-2 text-left"
                        }
                        key={header}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody ref={provided.innerRef} {...provided.droppableProps}>
                  {visibleRows.map((row, visibleIndex) => {
                    if (row.kind === "empty") {
                      return (
                        <tr
                          className="border-t bg-muted/20"
                          key={`draft-${row.row.id}`}
                        >
                          {!compactQuote && (
                            <td className="p-2 text-muted-foreground">—</td>
                          )}
                          <td className="text-muted-foreground">
                            {visibleIndex + 1}
                          </td>
                          <td className="p-1">
                            <ProductLibraryLookup
                              wideCommercial
                              onSearchChange={(value) =>
                                onBlankRowsDirtyChange?.(Boolean(value.trim()))
                              }
                              specificationMode={
                                kind === "quote" ? "machines-only" : "none"
                              }
                              captureQuotePacking={kind === "quote"}
                              documentLanguage={documentLanguage}
                              inputRef={(element) => {
                                blankSkuRef.current = element;
                              }}
                              onSelected={(snapshot) =>
                                void createDraft(snapshot, "name")
                              }
                              onManualSku={(sku) => void createDraft({ sku })}
                            />
                          </td>
                          <td colSpan={columns.length - (compactQuote ? 2 : 3)}>
                            <div className="flex items-center gap-2">
                              <input
                                aria-label="草稿 SKU 1"
                                onChange={(event) =>
                                  onBlankRowsDirtyChange?.(
                                    Boolean(event.target.value.trim()),
                                  )
                                }
                                onBlur={(event) => {
                                  const sku = event.currentTarget.value.trim();
                                  if (sku) void createDraft({ sku });
                                }}
                                className="w-full bg-transparent p-1 text-muted-foreground"
                                placeholder="输入 SKU / 产品名称，或按 Enter 连续录入"
                                onKeyDown={(event) => {
                                  if (
                                    event.key !== "Enter" ||
                                    !isEntryKey(event)
                                  )
                                    return;
                                  event.preventDefault();
                                  const sku = event.currentTarget.value.trim();
                                  if (!sku) return;
                                  void createDraft({ sku }, "blank");
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const { item, itemIndex: index } = row;
                    const product = (item.product_snapshot ?? {}) as Record<
                      string,
                      unknown
                    >;
                    const packing = (item.packing_snapshot ?? {}) as Record<
                      string,
                      unknown
                    >;
                    const updatePacking = async (
                      key: string,
                      value: unknown,
                    ) => {
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
                      const formatted =
                        parsed === null ? "" : parsed.toFixed(3);
                      setQuoteCbmDrafts((drafts) => ({
                        ...drafts,
                        [quoteCbmKey]: formatted,
                      }));
                      await updatePacking("carton_cbm", parsed);
                    };
                    const updateQuoteCnyPrice = async (raw: string) => {
                      const sourceCny =
                        raw === "" ? null : parseQuoteSourceCnyUnitPrice(raw);
                      let unitPrice = item.unit_price;
                      if (raw === "") {
                        unitPrice = 0;
                      } else if (quoteFxActive) {
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
                        unit_price_entered: raw !== "",
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
                        unit_price:
                          raw === "" ? 0 : parseQuoteUsdUnitPrice(raw),
                        unit_price_entered: raw !== "",
                      });
                    };
                    const commitQuoteUsdPrice = async () => {
                      const raw =
                        quoteUsdDrafts[quoteUsdKey] ??
                        savedQuotePriceText(item);
                      try {
                        await updateQuoteUsdPrice(raw);
                        setQuoteUsdDrafts((drafts) => ({
                          ...drafts,
                          [quoteUsdKey]:
                            raw === "" ? "" : formatQuotePrice(raw),
                        }));
                      } catch {
                        setQuoteUsdDrafts((drafts) => ({
                          ...drafts,
                          [quoteUsdKey]: savedQuotePriceText(item),
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
                            onKeyDown={(event) => {
                              const field = event.target;
                              if (
                                event.defaultPrevented ||
                                event.key !== "Enter" ||
                                !(field instanceof HTMLInputElement) ||
                                field.disabled ||
                                field.readOnly ||
                                !["text", "number", "search"].includes(
                                  field.type,
                                )
                              )
                                return;
                              if (!isEntryKey(event)) return;
                              event.preventDefault();
                              advanceRow(index);
                            }}
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
                              {visibleIndex + 1}
                            </td>
                            <td className="p-1">
                              {editable ? (
                                <ProductLibraryLookup
                                  wideCommercial
                                  sku={item.sku}
                                  onAdvance={() => advanceRow(index)}
                                  inputRef={(element) => {
                                    rowSkuRefs.current[String(item.id)] =
                                      element;
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
                                      clearProductIdentityForManualSku(
                                        item,
                                        sku,
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                <span>{item.sku}</span>
                              )}
                            </td>
                            {showCustomerCode &&
                              orderTemplate &&
                              customerCodeCell(item)}
                            <td>
                              <RequestedQuantity
                                websiteSource={
                                  compactQuote && websiteSourceQuote
                                }
                                value={item.requested_quantity_snapshot}
                              />
                              <div className="flex items-start gap-1">
                                <input
                                  ref={(element) => {
                                    rowNameRefs.current[String(item.id)] =
                                      element;
                                  }}
                                  aria-label={`产品名称 ${item.sku}`}
                                  className="min-w-0 w-full rounded border p-1"
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
                                />
                                {compactQuote && editable && (
                                  <details className="relative">
                                    <summary
                                      aria-label="行操作"
                                      className="cursor-pointer"
                                    >
                                      ⋯
                                    </summary>
                                    <div className="absolute right-0 z-10 w-max space-y-1 rounded border bg-background p-2">
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
                                        onClick={() => {
                                          if (onItemsChange)
                                            onItemsChange(
                                              items.filter(
                                                (candidate) =>
                                                  candidate.id !== item.id,
                                              ),
                                            );
                                          else
                                            void provider
                                              .delete(adapter.resource, {
                                                id: item.id,
                                                previousData: item,
                                              })
                                              .then(onChanged);
                                        }}
                                      >
                                        删除行
                                      </Button>
                                    </div>
                                  </details>
                                )}
                              </div>
                            </td>
                            <td>
                              <ProductSnapshotImage
                                sku={item.sku}
                                imageUrl={product.image_url}
                              />
                            </td>
                            {orderTemplate && (
                              <td>
                                <textarea
                                  aria-label="描述与规格"
                                  className="min-h-8 w-full resize-y rounded border p-1"
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
                              !compactQuote &&
                              customerCodeCell(item)}
                            {!orderTemplate && (
                              <td>
                                <textarea
                                  aria-label="描述与规格"
                                  className="min-h-8 w-full resize-y rounded border p-1"
                                  value={
                                    compactQuote
                                      ? (quoteSpecificationDrafts[
                                          String(item.id)
                                        ] ??
                                        normalizeSpecificationDisplay(
                                          product.specification,
                                        ))
                                      : String(product.specification ?? "")
                                  }
                                  disabled={!editable}
                                  onChange={(event) => {
                                    if (compactQuote)
                                      setQuoteSpecificationDrafts((drafts) => ({
                                        ...drafts,
                                        [String(item.id)]: event.target.value,
                                      }));
                                    if (onItemsChange)
                                      void save(item, {
                                        product_snapshot: {
                                          ...product,
                                          specification: event.target.value,
                                        },
                                      });
                                  }}
                                  onBlur={(event) => {
                                    if (compactQuote)
                                      setQuoteSpecificationDrafts((drafts) => {
                                        const next = { ...drafts };
                                        delete next[String(item.id)];
                                        return next;
                                      });
                                    if (!onItemsChange)
                                      void save(item, {
                                        product_snapshot: {
                                          ...product,
                                          specification: event.target.value,
                                        },
                                      });
                                  }}
                                />
                              </td>
                            )}
                            {orderTemplate && (
                              <td>
                                <input
                                  className="w-full rounded border p-1"
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
                                aria-label={
                                  compactQuote ? "Qty/Ctn" : undefined
                                }
                                className="w-full rounded border p-1"
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
                              />
                            </td>
                            {!compactQuote && !orderTemplate && (
                              <td>
                                <input
                                  className="w-full rounded border p-1"
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
                                />
                              </td>
                            )}
                            {!compactQuote && (
                              <td>
                                <input
                                  className="w-full rounded border p-1"
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
                                />
                              </td>
                            )}
                            {quoteFxActive ? (
                              <>
                                <td>
                                  <input
                                    aria-label="人民币单价"
                                    className="w-full rounded border p-1"
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    inputMode="decimal"
                                    value={
                                      quoteCnyDrafts[quoteCnyKey] ??
                                      formatQuotePrice(
                                        item.source_cny_unit_price,
                                      )
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
                                    onKeyDown={(event) => {
                                      if (
                                        event.key !== "Enter" ||
                                        !isEntryKey(event)
                                      )
                                        return;
                                      event.preventDefault();
                                      advanceRow(index);
                                    }}
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label="单价(USD)"
                                    className="w-full rounded border p-1"
                                    readOnly
                                    value={savedQuotePriceText(item)}
                                  />
                                </td>
                              </>
                            ) : (
                              <td>
                                <input
                                  aria-label="单价"
                                  className="w-full rounded border p-1"
                                  type="number"
                                  min={compactQuote ? "0" : undefined}
                                  step={compactQuote ? "0.0001" : "0.01"}
                                  inputMode={
                                    compactQuote ? "decimal" : undefined
                                  }
                                  value={
                                    compactQuote
                                      ? (quoteUsdDrafts[quoteUsdKey] ??
                                        savedQuotePriceText(item))
                                      : (commercialPriceDrafts[quoteUsdKey] ??
                                        savedPriceText(item))
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
                                    } else {
                                      const raw = event.target.value;
                                      setCommercialPriceDrafts((drafts) => ({
                                        ...drafts,
                                        [quoteUsdKey]: raw,
                                      }));
                                      if (onItemsChange) {
                                        try {
                                          void save(item, {
                                            unit_price:
                                              raw === ""
                                                ? 0
                                                : parseQuoteUsdUnitPrice(raw),
                                            unit_price_entered: raw !== "",
                                          });
                                        } catch {
                                          // Preserve an incomplete decimal draft until blur.
                                        }
                                      }
                                    }
                                  }}
                                  onBlur={(event) => {
                                    if (compactQuote)
                                      void commitQuoteUsdPrice();
                                    else if (!onItemsChange) {
                                      const raw = event.target.value;
                                      try {
                                        void save(item, {
                                          unit_price:
                                            raw === ""
                                              ? 0
                                              : parseQuoteUsdUnitPrice(raw),
                                          unit_price_entered: raw !== "",
                                        });
                                      } catch {
                                        setCommercialPriceDrafts((drafts) => ({
                                          ...drafts,
                                          [quoteUsdKey]: savedPriceText(item),
                                        }));
                                      }
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      if (!isEntryKey(event)) return;
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
                                  className="w-full rounded border p-1"
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
                                  onKeyDown={(event) => {
                                    if (
                                      event.key !== "Enter" ||
                                      !isEntryKey(event)
                                    )
                                      return;
                                    event.preventDefault();
                                    advanceRow(index);
                                  }}
                                />
                              </td>
                            )}
                            {!compactQuote && (
                              <td className="text-right">
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
                                  <details className="relative">
                                    <summary
                                      aria-label="行操作"
                                      className="cursor-pointer"
                                    >
                                      ⋯
                                    </summary>
                                    <div className="absolute right-0 z-10 w-max space-y-1 rounded border bg-background p-2">
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
                  {provided.placeholder}
                </tbody>
                {!compactQuote && (
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td colSpan={summaryLabelSpan}>汇总</td>
                      {!orderTemplate && <td />}
                      <td className="text-right">{totals.cartons}</td>
                      {orderTemplate && <td />}
                      <td className="text-right">{totals.quantity}</td>
                      <td></td>
                      <td className="text-right">
                        {currency} {totals.subtotal.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </Droppable>
        </DragDropContext>
      </div>
      <Button
        type="button"
        disabled={!editable}
        onClick={() => requestFocus("blank")}
      >
        新增产品行
      </Button>
      <CommercialItemDrawer
        quote={compactQuote}
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

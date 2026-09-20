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
import { ProductLibraryLookup } from "./ProductLibraryLookup";
import { CommercialItemDrawer } from "./CommercialItemDrawer";
import {
  commercialItemAdapter,
  clearProductIdentityForManualSku,
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
  onChanged,
  editable = true,
  onItemsChange,
}: {
  kind: CommercialDocumentKind;
  documentId: string;
  items: CommercialItem[];
  currency: string;
  onChanged: () => Promise<unknown>;
  editable?: boolean;
  /** When supplied, edits stay in the document session until its Save. */
  onItemsChange?: (items: CommercialItem[]) => void;
}) {
  const provider = useDataProvider();
  const [showCustomerCode, setShowCustomerCode] = useState(
    items.some((item) => Boolean(item.customer_code)),
  );
  const [drawer, setDrawer] = useState<CommercialItem | null>(null);
  const [draftRows, setDraftRows] = useState(() =>
    Array.from({ length: 5 }, (_, id) => id),
  );
  const draftSkuRefs = useRef<Array<HTMLInputElement | null>>([]);
  const adapter = commercialItemAdapter(kind);
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
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={showCustomerCode}
          disabled={!editable}
          onChange={(event) => setShowCustomerCode(event.target.checked)}
        />
        显示客户货号
      </label>
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
                  {[
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
                  ].map((header) => (
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
                          <td className="p-2" {...drag.dragHandleProps}>
                            ⠿
                          </td>
                          <td>{index + 1}</td>
                          <td className="p-1">
                            {editable ? (
                              <ProductLibraryLookup
                                sku={item.sku}
                                onSelected={(snapshot) =>
                                  void save(item, { ...snapshot })
                                }
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
                            <input
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
                            />
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
                          {showCustomerCode && (
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
                            />
                          </td>
                          <td>
                            <input
                              className="w-16 rounded border p-1"
                              type="number"
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
                            />
                          </td>
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
                            />
                          </td>
                          <td>
                            <input
                              className="w-20 rounded border p-1"
                              type="number"
                              step="0.01"
                              value={String(item.unit_price)}
                              disabled={!editable}
                              onChange={(event) => {
                                if (onItemsChange)
                                  void save(item, {
                                    unit_price: Number(event.target.value),
                                  });
                              }}
                              onBlur={(event) => {
                                if (!onItemsChange)
                                  void save(item, {
                                    unit_price: Number(event.target.value),
                                  });
                              }}
                            />
                          </td>
                          <td>
                            {currency}{" "}
                            {lineAmount(item.quantity, item.unit_price).toFixed(
                              2,
                            )}
                          </td>
                          <td>
                            {editable && (
                              <details>
                                <summary className="cursor-pointer">⋯</summary>
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
                      <td className="p-2 text-muted-foreground">—</td>
                      <td className="text-muted-foreground">
                        {items.length + draftIndex + 1}
                      </td>
                      <td className="p-1">
                        <ProductLibraryLookup
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
                      <td colSpan={showCustomerCode ? 10 : 9}>
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

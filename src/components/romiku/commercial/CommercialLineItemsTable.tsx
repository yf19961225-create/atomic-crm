import {
  useMemo,
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
}: {
  kind: CommercialDocumentKind;
  documentId: string;
  items: CommercialItem[];
  currency: string;
  onChanged: () => Promise<unknown>;
}) {
  const provider = useDataProvider();
  const [showCustomerCode, setShowCustomerCode] = useState(
    items.some((item) => Boolean(item.customer_code)),
  );
  const [drawer, setDrawer] = useState<CommercialItem | null>(null);
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
    await provider.update(adapter.resource, {
      id: item.id,
      data,
      previousData: item,
    });
    await onChanged();
  };
  const add = async () => {
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
  const copy = async (item: CommercialItem) => {
    const { id: _id, ...copyItem } = item;
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
                    "图片",
                    "SKU / 选品",
                    "产品名称",
                    ...(showCustomerCode ? ["客户货号"] : []),
                    "规格",
                    "包装",
                    "箱数",
                    "Qty/Ctn",
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
                      key === "cartons" || key === "qty_per_carton"
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
                          <td className="p-1">
                            <ProductLibraryLookup
                              onSelected={(snapshot) =>
                                void save(item, { ...snapshot })
                              }
                            />
                            <span>{item.sku}</span>
                          </td>
                          <td>
                            <input
                              className="w-28 rounded border p-1"
                              value={String(product.name ?? "")}
                              onBlur={(event) =>
                                void save(item, {
                                  product_snapshot: {
                                    ...product,
                                    name: event.target.value,
                                  },
                                })
                              }
                              onChange={() => {}}
                            />
                          </td>
                          {showCustomerCode && (
                            <td>
                              <input
                                className="w-24 rounded border p-1"
                                defaultValue={String(item.customer_code ?? "")}
                                onBlur={(event) =>
                                  void save(item, {
                                    customer_code: event.target.value,
                                  })
                                }
                              />
                            </td>
                          )}
                          <td>{String(product.specification ?? "—")}</td>
                          <td>{String(packing.description ?? "—")}</td>
                          <td>
                            <input
                              className="w-16 rounded border p-1"
                              type="number"
                              defaultValue={String(packing.cartons ?? "")}
                              onBlur={(event) =>
                                void updatePacking(
                                  "cartons",
                                  event.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="w-16 rounded border p-1"
                              type="number"
                              defaultValue={String(
                                packing.qty_per_carton ?? "",
                              )}
                              onBlur={(event) =>
                                void updatePacking(
                                  "qty_per_carton",
                                  event.target.value,
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="w-20 rounded border p-1"
                              type="number"
                              defaultValue={String(item.quantity)}
                              onBlur={(event) =>
                                void save(item, {
                                  quantity: Number(event.target.value),
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="w-20 rounded border p-1"
                              type="number"
                              step="0.01"
                              defaultValue={String(item.unit_price)}
                              onBlur={(event) =>
                                void save(item, {
                                  unit_price: Number(event.target.value),
                                })
                              }
                            />
                          </td>
                          <td>
                            {currency}{" "}
                            {lineAmount(item.quantity, item.unit_price).toFixed(
                              2,
                            )}
                          </td>
                          <td className="space-x-1">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setDrawer(item)}
                            >
                              详情
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void copy(item)}
                            >
                              复制
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                void provider
                                  .delete(adapter.resource, {
                                    id: item.id,
                                    previousData: item,
                                  })
                                  .then(onChanged)
                              }
                            >
                              删除
                            </Button>
                          </td>
                        </tr>
                      )}
                    </Draggable>
                  );
                })}
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
      <Button type="button" onClick={() => void add()}>
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
            notes: next.notes,
          });
        }}
      />
    </section>
  );
}

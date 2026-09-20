import type { CommercialItem } from "./commercialLineItems";

export function CommercialItemDrawer({
  item,
  onClose,
  onSave,
}: {
  item: CommercialItem | null;
  onClose: () => void;
  onSave: (item: CommercialItem) => void;
}) {
  if (!item) return null;
  const product = (item.product_snapshot ?? {}) as Record<string, unknown>;
  const packing = (item.packing_snapshot ?? {}) as Record<string, unknown>;
  return (
    <div
      role="dialog"
      aria-label="产品行详情"
      className="fixed inset-0 z-30 bg-black/30 p-6"
      onClick={onClose}
    >
      <form
        className="mx-auto max-w-xl space-y-3 rounded bg-background p-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(item);
        }}
      >
        <h2 className="font-semibold">产品行详情</h2>
        <label className="block">
          产品名称
          <input
            className="ml-2 w-full rounded border p-1"
            value={String(product.name ?? "")}
            onChange={(event) =>
              onSave({
                ...item,
                product_snapshot: { ...product, name: event.target.value },
              })
            }
          />
        </label>
        <label className="block">
          规格
          <textarea
            className="ml-2 w-full rounded border p-1"
            value={String(product.specification ?? "")}
            onChange={(event) =>
              onSave({
                ...item,
                product_snapshot: {
                  ...product,
                  specification: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="block">
          包装
          <input
            className="ml-2 w-full rounded border p-1"
            value={String(packing.description ?? "")}
            onChange={(event) =>
              onSave({
                ...item,
                packing_snapshot: {
                  ...packing,
                  description: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="block">
          备注
          <textarea
            className="ml-2 w-full rounded border p-1"
            value={String(item.notes ?? "")}
            onChange={(event) => onSave({ ...item, notes: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={onClose}
        >
          关闭
        </button>
      </form>
    </div>
  );
}

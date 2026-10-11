import { useState } from "react";
import { editableSignature } from "../updates/editableSnapshot";
import { useAppDraft } from "../updates/drafts";
import { normalizeSpecificationDisplay } from "../quotes/normalizeSpecificationDisplay";
import type { CommercialItem } from "./commercialLineItems";

export function CommercialItemDrawer({
  item,
  quote = false,
  onClose,
  onSave,
}: {
  item: CommercialItem | null;
  quote?: boolean;
  onClose: () => void;
  onSave: (item: CommercialItem) => void;
}) {
  if (!item) return null;
  return (
    <ItemDetails
      key={item.id}
      item={item}
      quote={quote}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
function ItemDetails({
  item,
  quote,
  onClose,
  onSave,
}: {
  item: CommercialItem;
  quote: boolean;
  onClose: () => void;
  onSave: (item: CommercialItem) => void;
}) {
  const [dirty, setDirty] = useState(false);
  useAppDraft(dirty);
  const product = (item.product_snapshot ?? {}) as Record<string, unknown>;
  const packing = (item.packing_snapshot ?? {}) as Record<string, unknown>;
  const keys = ["name", "specification", "packing", "requirement", "notes"];
  const [baseline] = useState(() =>
    editableSignature(
      {
        name: product.name,
        specification: quote
          ? normalizeSpecificationDisplay(product.specification)
          : product.specification,
        packing: packing.description,
        requirement: item.requirement,
        notes: item.notes,
      },
      keys,
    ),
  );
  return (
    <div
      role="dialog"
      aria-label="产品行详情"
      className="fixed inset-0 z-30 bg-black/30 p-6"
      onClick={onClose}
    >
      <form
        onInput={(event) =>
          setDirty(
            editableSignature(
              Object.fromEntries(new FormData(event.currentTarget)),
              keys,
            ) !== baseline,
          )
        }
        className="mx-auto max-w-xl space-y-3 rounded bg-background p-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          onSave({
            ...item,
            product_snapshot: {
              ...product,
              name: values.get("name"),
              specification: values.get("specification"),
            },
            packing_snapshot: {
              ...packing,
              description: values.get("packing"),
            },
            requirement: values.get("requirement"),
            notes: values.get("notes"),
          });
          onClose();
        }}
      >
        <h2 className="font-semibold">产品行详情</h2>
        <label className="block">
          产品名称
          <input
            name="name"
            className="ml-2 w-full rounded border p-1"
            defaultValue={String(product.name ?? "")}
          />
        </label>
        <label className="block">
          规格
          <textarea
            name="specification"
            className="ml-2 w-full rounded border p-1"
            defaultValue={
              quote
                ? normalizeSpecificationDisplay(product.specification)
                : String(product.specification ?? "")
            }
          />
        </label>
        <label className="block">
          包装
          <input
            name="packing"
            className="ml-2 w-full rounded border p-1"
            defaultValue={String(packing.description ?? "")}
          />
        </label>
        <label className="block">
          要求
          <textarea
            name="requirement"
            className="ml-2 w-full rounded border p-1"
            defaultValue={String(item.requirement ?? "")}
          />
        </label>
        <label className="block">
          备注
          <textarea
            name="notes"
            className="ml-2 w-full rounded border p-1"
            defaultValue={String(item.notes ?? "")}
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1">
          保存详情
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={onClose}
        >
          取消
        </button>
      </form>
    </div>
  );
}

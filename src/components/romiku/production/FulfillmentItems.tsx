import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { packingTotals, savePackingItem } from "../packing/packingWorkflow";
import { saveProductionItem } from "./productionWorkflow";
import type { FulfillmentKind } from "./fulfillmentShared";

const snapshotFields: Field[] = [
  { key: "product_snapshot.name", label: "Product name" },
  {
    key: "product_snapshot.image_url",
    label: "Product image URL",
    type: "url",
  },
  { key: "quantity", label: "Quantity", required: true },
];
const packingFields: Field[] = [
  { key: "cartons", label: "Cartons" },
  { key: "qty_per_carton", label: "Quantity per carton" },
  { key: "length_cm", label: "Length (cm)" },
  { key: "width_cm", label: "Width (cm)" },
  { key: "height_cm", label: "Height (cm)" },
  { key: "carton_weight_kg", label: "Weight per carton (kg)" },
  { key: "product_snapshot.shipping_mark", label: "Item shipping mark" },
  { key: "remark", label: "Remark", type: "textarea" },
];
export function FulfillmentItems({
  kind,
  parent,
  items,
  onChanged,
}: {
  kind: FulfillmentKind;
  parent: RaRecord;
  items: RaRecord[];
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<RaRecord | "new" | null>(null);
  const totals = packingTotals(items);
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold">Items</h2>
        <Button disabled={editing !== null} onClick={() => setEditing("new")}>
          Add {kind} item
        </Button>
      </div>
      {kind === "packing" && (
        <p>
          Total: {totals.cartons} cartons · {totals.cbm.toFixed(3)} m³ ·{" "}
          {totals.weight.toFixed(2)} kg
        </p>
      )}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "SKU / image",
                "Product",
                "Quantity",
                ...(kind === "packing"
                  ? ["Cartons", "CBM", "Weight", "Mark / remark"]
                  : ["Production note"]),
                "Action",
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const total = packingTotals([item]);
              return (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    {item.sku}
                    {/^https?:\/\//i.test(
                      item.product_snapshot?.image_url || "",
                    ) && (
                      <img
                        className="h-12 w-12 object-contain"
                        src={item.product_snapshot.image_url}
                        alt={item.product_snapshot?.name || item.sku}
                      />
                    )}
                  </td>
                  <td className="p-3">{item.product_snapshot?.name}</td>
                  <td className="p-3">{item.quantity}</td>
                  {kind === "packing" ? (
                    <>
                      <td className="p-3">{item.cartons}</td>
                      <td className="p-3">{total.cbm.toFixed(3)}</td>
                      <td className="p-3">{total.weight.toFixed(2)}</td>
                      <td className="p-3">
                        {item.product_snapshot?.shipping_mark} {item.remark}
                      </td>
                    </>
                  ) : (
                    <td className="p-3">{item.production_note_zh}</td>
                  )}
                  <td className="p-3">
                    <Button
                      variant="outline"
                      disabled={editing !== null}
                      onClick={() => setEditing(item)}
                    >
                      Edit {kind} item
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!items.length && <p>No items yet.</p>}
      {editing !== null && (
        <ItemEditor
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          parent={parent}
          previous={editing === "new" ? undefined : editing}
          onSaved={async () => {
            await onChanged();
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
function ItemEditor({
  kind,
  parent,
  previous,
  onSaved,
  onCancel,
}: {
  kind: FulfillmentKind;
  parent: RaRecord;
  previous?: RaRecord;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const provider = useDataProvider();
  const [sourceId, setSourceId] = useState(
    String(previous?.source_order_item_id || ""),
  );
  const [values, setValues] = useState<Values>(
      previous || { quantity: "", cartons: 0 },
    ),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const sources = useQuery({
    queryKey: ["fulfillment-sources", parent.order_id],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", {
        order_id: parent.order_id,
      }),
  });
  const remaining = useQuery({
    queryKey: ["packing-remaining", parent.order_id],
    queryFn: () =>
      readRelated(provider, "romiku_order_item_remaining", {
        order_id: parent.order_id,
      }),
    enabled: kind === "packing",
    staleTime: 0,
  });
  const available = remaining.data?.find((r) => String(r.id) === sourceId);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      if (!sourceId) throw new Error("Choose an Order item.");
      if (kind === "packing")
        await savePackingItem(provider, parent, sourceId, values, previous);
      else
        await saveProductionItem(provider, parent, sourceId, values, previous);
      await remaining.refetch();
      await onSaved();
    } catch (cause) {
      setFailure(errorMessage(cause));
      void remaining.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-4 rounded border p-4" onSubmit={save}>
      <h3 className="font-semibold">
        {previous ? "Edit" : "New"} {kind} item
      </h3>
      <fieldset className="space-y-4" disabled={busy}>
        <label className="block">
          Order item{" "}
          <select
            className="rounded border p-2"
            aria-label="Order item"
            required
            disabled={!!previous || sources.isPending || !!sources.error}
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              const source = sources.data?.find(
                (s) => String(s.id) === e.target.value,
              );
              setValues({
                quantity: "",
                cartons: 0,
                product_snapshot: structuredClone(
                  source?.product_snapshot || {},
                ),
                packaging_snapshot: structuredClone(
                  source?.packing_snapshot || {},
                ),
              });
            }}
          >
            <option value="">Choose Order item</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sku} · {s.product_snapshot?.name}
              </option>
            ))}
          </select>
        </label>
        {(sources.error || remaining.error) && (
          <p role="alert">
            Could not load Order items or remaining quantities.{" "}
            <Button
              type="button"
              onClick={() => {
                void sources.refetch();
                void remaining.refetch();
              }}
            >
              Retry
            </Button>
          </p>
        )}
        {kind === "packing" && available && (
          <p>
            Ordered: {available.ordered_quantity} · Already packed:{" "}
            {available.packed_quantity} · Remaining:{" "}
            {available.remaining_quantity}
          </p>
        )}
        {kind === "packing" && previous && (
          <p>
            This line already holds {previous.quantity}; that quantity is
            available when editing it.
          </p>
        )}
        <WorkflowFields
          fields={[
            ...snapshotFields,
            ...(kind === "packing"
              ? packingFields
              : [
                  {
                    key: "production_note_zh",
                    label: "Production note (Chinese)",
                    type: "textarea" as const,
                  },
                  {
                    key: "packaging_snapshot.notes",
                    label: "Packaging notes",
                    type: "textarea" as const,
                  },
                ]),
          ]}
          values={values}
          onChange={setValues}
        />
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={
              !sourceId ||
              !!sources.error ||
              (kind === "packing" && (remaining.isPending || !!remaining.error))
            }
          >
            Save {kind} item
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}

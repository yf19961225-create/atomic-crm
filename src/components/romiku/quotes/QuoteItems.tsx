import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { errorMessage } from "../outbound/RelatedRecords";
import { quoteItemWrite } from "./quoteWorkflow";

const fields: Field[] = [
  { key: "sku", label: "SKU", required: true },
  { key: "customer_code", label: "Customer code" },
  { key: "quantity", label: "Quantity", required: true },
  { key: "unit_price", label: "Unit price", required: true },
  { key: "product_snapshot.moq", label: "MOQ" },
  { key: "product_snapshot.specification", label: "Specification" },
  { key: "packing_snapshot.description", label: "Packaging" },
  { key: "requirement", label: "Requirement", type: "textarea" },
  { key: "notes", label: "Item notes", type: "textarea" },
];
export function QuoteItems({
  quoteId,
  items,
  onChanged,
  kind = "quote",
}: {
  quoteId: string;
  items: RaRecord[];
  onChanged: () => Promise<unknown>;
  kind?: "quote" | "pi" | "order";
}) {
  const [adding, setAdding] = useState(false);
  const label = kind === "pi" ? "PI" : kind === "order" ? "Order" : "Quote";
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Save each item separately. MOQ, specification and packaging are stored
        in this {label}'s snapshots.
      </p>
      {items.map((item) => (
        <ItemEditor
          key={`${item.id}:${item.updated_at || JSON.stringify(item)}`}
          quoteId={quoteId}
          kind={kind}
          item={item}
          onChanged={onChanged}
        />
      ))}
      {!items.length && !adding && <p>No {label} items yet.</p>}
      {adding ? (
        <ItemEditor
          quoteId={quoteId}
          kind={kind}
          onChanged={async () => {
            await onChanged();
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>Add item</Button>
      )}
    </div>
  );
}
function ItemEditor({
  quoteId,
  item,
  onChanged,
  onCancel,
  kind,
}: {
  quoteId: string;
  item?: RaRecord;
  onChanged: () => Promise<unknown>;
  onCancel?: () => void;
  kind: "quote" | "pi" | "order";
}) {
  const provider = useDataProvider();
  const resource = `romiku_${kind}_items`;
  const [values, setValues] = useState<Values>(
    item || {
      sku: "",
      quantity: 1,
      unit_price: 0,
      product_snapshot: {},
      packing_snapshot: {},
    },
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const mutate = async (remove = false) => {
    setBusy(true);
    setFailure("");
    try {
      if (remove && item)
        await provider.delete(resource, {
          id: item.id,
          previousData: item,
        });
      else {
        const data = quoteItemWrite(values);
        // Existing verified Sanity identity and source lineage remain on the saved row.
        // SKU changes must not leave a stale match attached to a different product.
        if (item && data.sku !== item.sku) data.sanity_product_id = null;
        if (item)
          await provider.update(resource, {
            id: item.id,
            data,
            previousData: item,
          });
        else
          await provider.create(resource, {
            data: { ...data, [`${kind}_id`]: quoteId },
          });
      }
      await onChanged();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void mutate();
      }}
    >
      <fieldset disabled={busy} className="space-y-3">
        <h3 className="font-semibold">{item ? item.sku : "New item"}</h3>
        {item?.source_website_inquiry_item_id && (
          <p className="text-muted-foreground text-xs">
            Copied from inquiry item · {item.source_website_inquiry_item_id}
          </p>
        )}
        <WorkflowFields fields={fields} values={values} onChange={setValues} />
        <div className="flex gap-3">
          <Button type="submit">{busy ? "Saving…" : "Save item"}</Button>
          {item && (
            <Button
              type="button"
              variant="outline"
              onClick={() => mutate(true)}
            >
              Remove item
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}

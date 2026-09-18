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
  { key: "customer_code", label: "客户编码" },
  { key: "quantity", label: "数量", required: true },
  { key: "unit_price", label: "单价", required: true },
  { key: "product_snapshot.moq", label: "最小起订量" },
  { key: "product_snapshot.specification", label: "规格" },
  { key: "packing_snapshot.description", label: "包装" },
  { key: "requirement", label: "要求", type: "textarea" },
  { key: "notes", label: "产品项备注", type: "textarea" },
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
  const label = kind === "pi" ? "PI" : kind === "order" ? "订单" : "报价单";
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        请分别保存每个产品项。最小起订量、规格和包装将保存在此{label}的快照中。
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
      {!items.length && !adding && <p>暂无{label}产品项。</p>}
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
        <Button onClick={() => setAdding(true)}>添加产品项</Button>
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
        <h3 className="font-semibold">{item ? item.sku : "新产品项"}</h3>
        {item?.source_website_inquiry_item_id && (
          <p className="text-muted-foreground text-xs">
            已从询盘产品项复制 · {item.source_website_inquiry_item_id}
          </p>
        )}
        <WorkflowFields fields={fields} values={values} onChange={setValues} />
        <div className="flex gap-3">
          <Button type="submit">{busy ? "保存中…" : "保存产品项"}</Button>
          {item && (
            <Button
              type="button"
              variant="outline"
              onClick={() => mutate(true)}
            >
              删除产品项
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
          )}
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}

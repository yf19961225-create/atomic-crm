import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  createProductionOrders,
  ProductionCreationError,
  type ProductionSelection,
} from "./productionWorkflow";
import { OrderSelect } from "./fulfillmentShared";

export function ProductionCreate() {
  const provider = useDataProvider(),
    [params] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || "");
  const [selections, setSelections] = useState<
    Record<string, ProductionSelection>
  >({});
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [created, setCreated] = useState<RaRecord[] | null>(null);
  const items = useQuery({
    queryKey: ["production-source-items", orderId],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", { order_id: orderId }),
    enabled: !!orderId,
  });
  const suppliers = useQuery({
    queryKey: ["production-suppliers"],
    queryFn: () => readRelated(provider, "romiku_suppliers", {}),
  });
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      setCreated(
        await createProductionOrders(
          provider,
          orderId,
          Object.values(selections),
        ),
      );
    } catch (cause) {
      setFailure(errorMessage(cause));
      if (cause instanceof ProductionCreationError && cause.documents.length)
        setCreated(cause.documents);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <Link className="underline" to="/production">
        Back to Production
      </Link>
      <h1 className="text-3xl font-semibold">New Production Orders</h1>
      <p>
        Select items and one supplier for each. One Production Order is created
        per supplier, with independent Order item and supplier snapshots.
      </p>
      <form className="space-y-4" onSubmit={create}>
        <fieldset disabled={busy || created !== null} className="space-y-4">
          <OrderSelect
            value={orderId}
            onChange={(id) => {
              setOrderId(id);
              setSelections({});
            }}
          />
          {(items.error || suppliers.error) && (
            <p role="alert">
              Could not load Order items or suppliers.{" "}
              <Button
                type="button"
                onClick={() => {
                  void items.refetch();
                  void suppliers.refetch();
                }}
              >
                Retry
              </Button>
            </p>
          )}
          {orderId && items.isPending && <p>Loading Order items…</p>}
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Select",
                    "SKU / product",
                    "Ordered",
                    "Production quantity",
                    "Supplier",
                  ].map((s) => (
                    <th key={s} className="p-3">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.data?.map((item) => {
                  const selected = selections[String(item.id)];
                  const change = (patch: Partial<ProductionSelection>) =>
                    setSelections({
                      ...selections,
                      [item.id]: { ...selected, ...patch },
                    });
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.sku}`}
                          checked={!!selected}
                          onChange={(e) => {
                            if (e.target.checked)
                              setSelections({
                                ...selections,
                                [item.id]: {
                                  itemId: String(item.id),
                                  supplierId: "",
                                  quantity: Number(item.quantity),
                                },
                              });
                            else
                              setSelections(
                                Object.fromEntries(
                                  Object.entries(selections).filter(
                                    ([id]) => id !== String(item.id),
                                  ),
                                ),
                              );
                          }}
                        />
                      </td>
                      <td className="p-3">
                        {item.sku} · {item.product_snapshot?.name}
                      </td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">
                        <input
                          className="rounded border p-2"
                          type="number"
                          step="any"
                          min="0.0001"
                          required={!!selected}
                          disabled={!selected}
                          aria-label={`Production quantity ${item.sku}`}
                          value={selected?.quantity ?? ""}
                          onChange={(e) =>
                            change({ quantity: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <select
                          className="rounded border p-2"
                          required={!!selected}
                          disabled={
                            !selected ||
                            suppliers.isPending ||
                            !!suppliers.error
                          }
                          aria-label={`Supplier ${item.sku}`}
                          value={selected?.supplierId || ""}
                          onChange={(e) =>
                            change({ supplierId: e.target.value })
                          }
                        >
                          <option value="">Choose supplier</option>
                          {suppliers.data?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.data?.length === 0 && <p>This Order has no items.</p>}
          <Button
            type="submit"
            disabled={
              !Object.keys(selections).length ||
              !!items.error ||
              !!suppliers.error
            }
          >
            Create Production Orders
          </Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
      {created && (
        <div className="space-y-2">
          <p role="status">
            {failure
              ? "Saved documents to review"
              : `Created ${created.length} Production Orders`}
          </p>
          {created.map((record) => (
            <p key={record.id}>
              <Link className="underline" to={`/production/${record.id}`}>
                {record.document_number || record.supplier_snapshot.name}
              </Link>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

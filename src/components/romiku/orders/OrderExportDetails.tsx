import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  orderExportSnapshot,
  withOrderExportSnapshot,
  type OrderExportSnapshot,
} from "./orderExportSnapshot";

export function OrderExportDetails({
  values,
  editable,
  onChange,
}: {
  values: Record<string, unknown>;
  editable: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const snapshot = orderExportSnapshot(values.terms_snapshot);
  const update = (next: OrderExportSnapshot) =>
    onChange({
      ...values,
      terms_snapshot: withOrderExportSnapshot(
        values.terms_snapshot as Record<string, unknown>,
        next,
      ),
    });
  const buyer = (values.counterparty_snapshot || {}) as Record<string, unknown>;
  if (!open)
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        导出信息 / Document Details
      </Button>
    );
  return (
    <section className="space-y-4 rounded border p-4" aria-label="导出信息">
      <div className="flex justify-between">
        <h2 className="font-semibold">导出信息 / Document Details</h2>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          关闭
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <section>
          <h3 className="font-medium">Seller</h3>
          {Object.entries(snapshot.seller).map(([key, value]) => (
            <label className="block text-sm" key={key}>
              {key}
              <input
                className="w-full rounded border p-1"
                disabled={!editable}
                value={value}
                onChange={(e) =>
                  update({
                    ...snapshot,
                    seller: { ...snapshot.seller, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </section>
        <section>
          <h3 className="font-medium">Buyer</h3>
          {[
            ["name", "Company / Name"],
            ["address", "Address"],
            ["whatsapp", "Tel / WhatsApp"],
            ["website", "Website"],
            ["email", "Email"],
          ].map(([key, label]) => (
            <label className="block text-sm" key={key}>
              {label}
              <input
                className="w-full rounded border p-1"
                disabled={!editable}
                value={String(buyer[key] || "")}
                onChange={(e) =>
                  onChange({
                    ...values,
                    counterparty_snapshot: { ...buyer, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </section>
      </div>
      <section>
        <h3 className="font-medium">Terms & Conditions</h3>
        {Object.entries(snapshot.terms).map(([key, term]) => (
          <label className="block text-sm" key={key}>
            {key === "payment" && (
              <span>
                <input
                  type="checkbox"
                  checked={term.visible !== false}
                  disabled={!editable}
                  onChange={(e) =>
                    update({
                      ...snapshot,
                      terms: {
                        ...snapshot.terms,
                        payment: {
                          ...snapshot.terms.payment,
                          visible: e.target.checked,
                        },
                      },
                    })
                  }
                />{" "}
                显示付款条件
              </span>
            )}
            <textarea
              className="mt-1 block w-full rounded border p-1"
              disabled={!editable}
              value={term.text}
              onChange={(e) =>
                update({
                  ...snapshot,
                  terms: {
                    ...snapshot.terms,
                    [key]: { ...term, text: e.target.value },
                  },
                })
              }
            />
          </label>
        ))}
      </section>
    </section>
  );
}

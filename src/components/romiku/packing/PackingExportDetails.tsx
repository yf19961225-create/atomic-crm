import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  defaultPackingSellerSnapshot,
  packingContactSnapshot,
} from "./packingExportSnapshot";

const fields = [
  "company_name",
  "address",
  "tel_whatsapp",
  "website",
  "email",
] as const;

/** Editable Packing-owned Seller and Buyer snapshots for the fixed XLSX. */
export function PackingExportDetails({
  values,
  editable,
  onChange,
}: {
  values: Record<string, unknown>;
  editable: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const savedSeller = (values.seller_snapshot || {}) as Record<string, unknown>;
  const savedBuyer = (values.buyer_snapshot || {}) as Record<string, unknown>;
  const seller = {
    ...defaultPackingSellerSnapshot(),
    ...packingContactSnapshot(savedSeller),
  };
  const buyer = packingContactSnapshot(savedBuyer);
  const update = (
    party: "seller_snapshot" | "buyer_snapshot",
    key: (typeof fields)[number],
    value: string,
  ) =>
    onChange({
      ...values,
      [party]: {
        ...(party === "seller_snapshot" ? savedSeller : savedBuyer),
        [key]: value,
      },
    });
  if (!open)
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        导出信息 / Document Details
      </Button>
    );
  const inputs = (
    title: "Seller" | "Buyer",
    party: "seller_snapshot" | "buyer_snapshot",
    snapshot: Record<(typeof fields)[number], string>,
  ) => (
    <section>
      <h3 className="font-medium">{title}</h3>
      {fields.map((key) => (
        <label className="block text-sm" key={key}>
          {key}
          {key === "address" ? (
            <textarea
              aria-label={`${title} ${key}`}
              className="block w-full rounded border p-1"
              disabled={!editable}
              value={snapshot[key]}
              onChange={(event) => update(party, key, event.target.value)}
            />
          ) : (
            <input
              aria-label={`${title} ${key}`}
              className="w-full rounded border p-1"
              disabled={!editable}
              value={snapshot[key]}
              onChange={(event) => update(party, key, event.target.value)}
            />
          )}
        </label>
      ))}
    </section>
  );
  return (
    <section className="space-y-4 rounded border p-4" aria-label="导出信息">
      <div className="flex justify-between">
        <h2 className="font-semibold">导出信息 / Document Details</h2>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          关闭
        </Button>
      </div>
      {inputs("Seller", "seller_snapshot", seller)}
      {inputs("Buyer", "buyer_snapshot", buyer)}
    </section>
  );
}

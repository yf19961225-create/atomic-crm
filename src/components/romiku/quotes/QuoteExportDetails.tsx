import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  quoteExportSnapshot,
  withQuoteExportSnapshot,
} from "./quoteExportSnapshot";

/** Quote-specific editable Seller snapshot; the fixed template has no Buyer. */
export function QuoteExportDetails({
  values,
  editable,
  onChange,
}: {
  values: Record<string, unknown>;
  editable: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const exportSnapshot = quoteExportSnapshot(values.terms_snapshot);
  const updateSeller = (key: string, value: string) =>
    onChange({
      ...values,
      terms_snapshot: withQuoteExportSnapshot(
        values.terms_snapshot as Record<string, unknown>,
        {
          ...exportSnapshot,
          seller: { ...exportSnapshot.seller, [key]: value },
        },
      ),
    });
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
      <section>
        <h3 className="font-medium">Seller</h3>
        {Object.entries(exportSnapshot.seller).map(([key, value]) => (
          <label className="block text-sm" key={key}>
            {key}
            {key === "address" ? (
              <textarea
                aria-label={`Seller ${key}`}
                className="block w-full rounded border p-1"
                disabled={!editable}
                value={value}
                onChange={(event) => updateSeller(key, event.target.value)}
              />
            ) : (
              <input
                aria-label={`Seller ${key}`}
                className="w-full rounded border p-1"
                disabled={!editable}
                value={value}
                onChange={(event) => updateSeller(key, event.target.value)}
              />
            )}
          </label>
        ))}
      </section>
    </section>
  );
}

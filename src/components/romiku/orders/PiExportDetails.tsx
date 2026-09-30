import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  defaultPiBankSnapshot,
  piExportSnapshot,
  withPiExportSnapshot,
  type PiBankSnapshot,
  type PiExportSnapshot,
} from "./piExportSnapshot";

export function PiExportDetails({
  values,
  editable,
  onChange,
}: {
  values: Record<string, unknown>;
  editable: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const exportSnapshot = piExportSnapshot(values.terms_snapshot);
  const bank = {
    ...defaultPiBankSnapshot(),
    ...((values.bank_snapshot as Record<string, unknown>) || {}),
  } as PiBankSnapshot;
  const buyer = (values.counterparty_snapshot || {}) as Record<string, unknown>;
  const updateExport = (next: PiExportSnapshot) =>
    onChange({
      ...values,
      terms_snapshot: withPiExportSnapshot(
        values.terms_snapshot as Record<string, unknown>,
        next,
      ),
    });
  const updateBank = (next: PiBankSnapshot) =>
    onChange({ ...values, bank_snapshot: next });
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
          {Object.entries(exportSnapshot.seller).map(([key, value]) => (
            <label className="block text-sm" key={key}>
              {key}
              <input
                aria-label={`Seller ${key}`}
                className="w-full rounded border p-1"
                disabled={!editable}
                value={value}
                onChange={(event) =>
                  updateExport({
                    ...exportSnapshot,
                    seller: {
                      ...exportSnapshot.seller,
                      [key]: event.target.value,
                    },
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
                aria-label={`Buyer ${label}`}
                className="w-full rounded border p-1"
                disabled={!editable}
                value={String(buyer[key] || "")}
                onChange={(event) =>
                  onChange({
                    ...values,
                    counterparty_snapshot: {
                      ...buyer,
                      [key]: event.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </section>
      </div>
      <section>
        <h3 className="font-medium">Terms &amp; Conditions</h3>
        <label className="mb-2 block text-sm">
          <input
            aria-label="显示条款与条件"
            type="checkbox"
            checked={exportSnapshot.terms_visible}
            disabled={!editable}
            onChange={(event) =>
              updateExport({
                ...exportSnapshot,
                terms_visible: event.target.checked,
              })
            }
          />{" "}
          显示条款与条件
        </label>
        {Object.entries(exportSnapshot.terms).map(([key, term]) => (
          <label className="block text-sm" key={key}>
            {key}
            <textarea
              aria-label={`Terms ${key}`}
              className="mt-1 block w-full rounded border p-1"
              disabled={!editable}
              value={term.text}
              onChange={(event) =>
                updateExport({
                  ...exportSnapshot,
                  terms: {
                    ...exportSnapshot.terms,
                    [key]: { ...term, text: event.target.value },
                  },
                })
              }
            />
          </label>
        ))}
      </section>
      <section>
        <h3 className="font-medium">Banking Information</h3>
        <label className="mb-2 block text-sm">
          <input
            aria-label="显示银行信息"
            type="checkbox"
            checked={bank.bank_information_visible}
            disabled={!editable}
            onChange={(event) =>
              updateBank({
                ...bank,
                bank_information_visible: event.target.checked,
              })
            }
          />{" "}
          显示银行信息
        </label>
        {(
          [
            "beneficiary_name",
            "beneficiary_address",
            "bank_name",
            "bank_address",
            "account_no",
            "swift_code",
          ] as const
        ).map((key) => (
          <label className="block text-sm" key={key}>
            {key}
            <input
              aria-label={`Bank ${key}`}
              className="w-full rounded border p-1"
              disabled={!editable}
              value={bank[key]}
              onChange={(event) =>
                updateBank({ ...bank, [key]: event.target.value })
              }
            />
          </label>
        ))}
      </section>
    </section>
  );
}

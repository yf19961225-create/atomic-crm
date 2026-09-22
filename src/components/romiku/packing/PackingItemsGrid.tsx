import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { Button } from "@/components/ui/button";

type Row = RaRecord & { [key: string]: unknown };
const editable = [
  "quantity",
  "cartons",
  "qty_per_carton",
  "length_cm",
  "width_cm",
  "height_cm",
  "carton_weight_kg",
];
const number = (value: unknown) => Number(value || 0);

export function PackingItemsGrid({
  items,
  onSaved,
}: {
  items: Row[];
  onSaved: () => Promise<unknown>;
}) {
  const provider = useDataProvider();
  const [draft, setDraft] = useState<Row[]>(items.map((item) => ({ ...item })));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(items);
  const change = (row: number, key: string, value: string) =>
    setDraft((current) =>
      current.map((item, index) =>
        index === row
          ? { ...item, [key]: value === "" ? "" : Number(value) }
          : item,
      ),
    );
  const total = draft.reduce(
    (sum, item) => ({
      quantity: sum.quantity + number(item.quantity),
      cartons: sum.cartons + number(item.cartons),
      cbm:
        sum.cbm +
        (number(item.length_cm) *
          number(item.width_cm) *
          number(item.height_cm) *
          number(item.cartons)) /
          1_000_000,
      weight: sum.weight + number(item.carton_weight_kg) * number(item.cartons),
    }),
    { quantity: 0, cartons: 0, cbm: 0, weight: 0 },
  );
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">装箱产品项</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => setDraft(items.map((item) => ({ ...item })))}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              try {
                for (let i = 0; i < draft.length; i++)
                  await provider.update("romiku_packing_items", {
                    id: draft[i].id,
                    data: Object.fromEntries(
                      editable.map((key) => [
                        key,
                        draft[i][key] === "" ? 0 : draft[i][key],
                      ]),
                    ),
                    previousData: items[i],
                  });
                await onSaved();
              } finally {
                setSaving(false);
              }
            }}
          >
            保存
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                "No.",
                "货号",
                "产品名称",
                "图片",
                "总数量",
                "箱数",
                "Qty/Ctn",
                "长 cm",
                "宽 cm",
                "高 cm",
                "单箱体积",
                "总体积",
                "单箱重量",
                "总重量",
              ].map((label) => (
                <th className="p-2 text-left" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.map((item, index) => {
              const perCbm =
                  (number(item.length_cm) *
                    number(item.width_cm) *
                    number(item.height_cm)) /
                  1_000_000,
                warning =
                  item.qty_per_carton &&
                  number(item.quantity) !==
                    number(item.cartons) * number(item.qty_per_carton);
              return (
                <tr className="border-t" key={String(item.id)}>
                  <td className="p-2">{index + 1}</td>
                  <td className="p-2">{String(item.sku || "")}</td>
                  <td className="p-2">
                    {String((item.product_snapshot as any)?.name || "")}
                  </td>
                  <td className="p-2">
                    {(item.product_snapshot as any)?.image_url && (
                      <img
                        className="h-8 w-8 object-cover"
                        src={(item.product_snapshot as any).image_url}
                        alt=""
                      />
                    )}
                  </td>
                  {editable.map((key) => (
                    <td className="p-1 text-right" key={key}>
                      <input
                        aria-label={`${key} ${item.sku}`}
                        className="w-20 rounded border p-1 text-right"
                        type="number"
                        step="any"
                        value={String(item[key] ?? "")}
                        onChange={(event) =>
                          change(index, key, event.target.value)
                        }
                      />
                      {key === "qty_per_carton" && warning && (
                        <span title="数量与箱数×Qty/Ctn 不一致；允许尾箱">
                          ⚠
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-right">{perCbm.toFixed(3)} m³</td>
                  <td className="p-2 text-right">
                    {(perCbm * number(item.cartons)).toFixed(3)} m³
                  </td>
                  <td className="p-2 text-right">
                    {(
                      number(item.carton_weight_kg) * number(item.cartons)
                    ).toFixed(2)}{" "}
                    kg
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={4}>合计</td>
              <td className="text-right">{total.quantity}</td>
              <td className="text-right">{total.cartons}</td>
              <td colSpan={5} />
              <td className="text-right">{total.cbm.toFixed(3)} m³</td>
              <td colSpan={1} />
              <td className="text-right">{total.weight.toFixed(2)} kg</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

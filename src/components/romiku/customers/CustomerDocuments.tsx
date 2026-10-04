import { Link } from "react-router";
import { type CustomerDocument, money } from "./customerBusinessApi";
import { BusinessLink } from "./CustomerBusinessHistory";
import { searchLabels } from "../search/search";
import {
  documentStatusLabel,
  productionStatusChoices,
} from "../commercialLabels";
export function CustomerDocuments({ items }: { items: CustomerDocument[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {[
              "单据类型",
              "单据编号",
              "日期",
              "来源 / 所属 Order",
              "状态",
              "金额",
            ].map((s) => (
              <th className="p-2" key={s}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr className="border-t" key={`${d.resource_type}-${d.id}`}>
              <td className="p-2">{searchLabels[d.resource_type]}</td>
              <td className="p-2">
                <BusinessLink kind={d.resource_type} record={d} />
              </td>
              <td className="p-2">{d.document_date?.slice(0, 10)}</td>
              <td className="p-2">
                {d.order_id ? (
                  <Link className="underline" to={`/orders/${d.order_id}`}>
                    {d.order_number}
                  </Link>
                ) : d.related_orders?.length ? (
                  <div className="space-y-1">
                    {d.related_orders.map((o) => (
                      <div key={o.id}>
                        <BusinessLink kind="order" record={o} />
                      </div>
                    ))}
                  </div>
                ) : (
                  "独立单据"
                )}
              </td>
              <td className="p-2">
                {d.resource_type === "production"
                  ? productionStatusChoices.find((s) => s.id === d.status)
                      ?.label ||
                    d.status ||
                    "—"
                  : d.resource_type === "packing"
                    ? "—"
                    : documentStatusLabel(d.status || "")}
                {d.archived_at && " · 已归档"}
              </td>
              <td className="p-2">
                {d.currency && d.total != null
                  ? money(d.total, d.currency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="p-4">暂无符合条件的单据。</p>}
    </div>
  );
}

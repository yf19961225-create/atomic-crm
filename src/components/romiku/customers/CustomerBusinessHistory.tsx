import { Link } from "react-router";
import { searchPath, searchLabels } from "../search/search";
import { documentStatusLabel } from "../commercialLabels";
import {
  type BusinessKind,
  type DocumentLink,
  type OrderCard,
  money,
} from "./customerBusinessApi";
export function BusinessLink({
  record,
  kind,
}: {
  record: DocumentLink;
  kind: BusinessKind;
}) {
  return (
    <span>
      <Link className="text-primary underline" to={searchPath(kind, record.id)}>
        {record.document_number}
      </Link>
      {record.matched && <span className="ml-2 text-xs">匹配搜索</span>}
      {record.customer_conflict && (
        <span className="ml-2 text-destructive">已关联其他客户</span>
      )}
    </span>
  );
}
function Children({
  kind,
  items,
  empty,
}: {
  kind: BusinessKind;
  items: DocumentLink[];
  empty: string;
}) {
  return (
    <div>
      <strong>{searchLabels[kind]}</strong>
      {items.length ? (
        <ul className="space-y-1 pl-4">
          {items.map((i) => (
            <li key={i.id}>
              <BusinessLink kind={kind} record={i} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </div>
  );
}
export function CustomerBusinessHistory({ orders }: { orders: OrderCard[] }) {
  return (
    <div className="space-y-3">
      {!orders.length && <p>暂无符合条件的订单。</p>}
      {orders.map((o) => (
        <article
          key={o.id}
          className="rounded-lg border p-4 space-y-3"
          aria-label={`订单 ${o.document_number}`}
        >
          <div className="flex flex-wrap justify-between gap-2">
            <BusinessLink kind="order" record={o} />
            <span>
              {o.document_date} · {documentStatusLabel(o.status || "")}
              {o.archived_at && " · 已归档"}
            </span>
          </div>
          <p>
            {money(o.total || 0, o.currency || "")} · 已收{" "}
            {money(o.payment_summary.paid, o.currency || "")} · 余额{" "}
            {money(o.payment_summary.balance, o.currency || "")}
          </p>
          <details>
            <summary className="cursor-pointer">
              展开业务链与收款（生产 {o.productions.length} · 装箱{" "}
              {o.packings.length} · 收款 {o.payments.length}）
            </summary>
            <div className="mt-3 grid gap-4 border-l pl-4">
              <Children
                kind="quote"
                items={o.source_quotes}
                empty="暂无报价单"
              />
              <Children
                kind="pi"
                items={o.source_pi ? [o.source_pi] : []}
                empty="暂无 PI"
              />
              <Children
                kind="production"
                items={o.productions}
                empty="尚未创建生产单"
              />
              <Children
                kind="packing"
                items={o.packings}
                empty="尚未创建装箱单"
              />
              <div>
                <strong>Payment</strong>
                {!o.payments.length ? (
                  <p>暂无收款记录。</p>
                ) : (
                  <ul>
                    {o.payments.map((p) => (
                      <li key={p.id}>
                        {p.kind === "deposit"
                          ? "定金"
                          : p.kind === "balance"
                            ? "尾款"
                            : "其他收款"}{" "}
                        · {money(p.amount, o.currency || "")} ·{" "}
                        {p.received_at.slice(0, 10)} ·{" "}
                        {p.status === "voided"
                          ? `已作废：${p.void_reason || ""}`
                          : "已收款"}
                        {p.payment_reference && ` · ${p.payment_reference}`}
                      </li>
                    ))}
                  </ul>
                )}
                <Link className="underline text-sm" to={`/orders/${o.id}`}>
                  打开订单查看收款详情
                </Link>
              </div>
            </div>
          </details>
        </article>
      ))}
    </div>
  );
}

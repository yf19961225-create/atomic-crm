import { useState } from "react";
import { Link } from "react-router";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readRelated } from "../outbound/workflow";
import { Button } from "@/components/ui/button";
import { productionStatusLabel } from "../commercialLabels";
import {
  productionSuffix,
  syncOrderProductionDefaults,
} from "./productionWorkspace";
export function OrderProductionPanel({ order }: { order: RaRecord }) {
  const provider = useDataProvider(),
    cache = useQueryClient();
  const children = useQuery({
    queryKey: ["order-productions", order.id],
    queryFn: () =>
      readRelated(provider, "romiku_production_orders", { order_id: order.id }),
  });
  const [preview, setPreview] = useState<{
      token?: string;
      productions?: RaRecord[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function sync(confirm = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await syncOrderProductionDefaults(
        String(order.id),
        confirm ? preview : null,
      );
      if (confirm) {
        setPreview(null);
        await cache.invalidateQueries();
        setMessage(`已同步 ${result.count} 张生产单，产品例外已保留。`);
      } else setPreview(result);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "无法同步。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded border p-4"
      aria-label="订单下的生产单"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">
          生产单 · {order.document_number}
        </h2>
        <Button asChild>
          <Link to={`/production/new?order=${order.id}`}>+ 新建生产单</Link>
        </Button>
      </div>
      {children.isPending ? (
        <p>正在加载生产单…</p>
      ) : children.error ? (
        <p role="alert">
          无法加载生产单。
          <Button onClick={() => void children.refetch()}>重试</Button>
        </p>
      ) : !children.data?.length ? (
        <p>尚未创建生产单</p>
      ) : (
        <details open>
          <summary className="cursor-pointer">
            此订单全部 {children.data.length} 张生产单
          </summary>
          <ul className="space-y-2 py-3">
            {[...children.data]
              .sort((a, b) =>
                String(a.created_at || "").localeCompare(
                  String(b.created_at || ""),
                ),
              )
              .map((p) => (
                <li key={p.id}>
                  ↳{" "}
                  <Link className="underline" to={`/production/${p.id}`}>
                    {productionSuffix(p.document_number, order.document_number)}
                  </Link>{" "}
                  · {productionStatusLabel(p.status)}
                  {p.archived_at ? " · 已归档" : ""}
                </li>
              ))}
          </ul>
        </details>
      )}
      <Button
        variant="outline"
        disabled={busy || !children.data?.length}
        onClick={() => void sync()}
      >
        将订单当前统一要求同步到未完成生产单
      </Button>
      {preview && (
        <div
          role="alertdialog"
          aria-label="确认同步生产要求"
          className="space-y-3 rounded border p-3"
        >
          <p>
            仅覆盖以下生产单的统一要求，保留全部产品例外。已完成、已收货、已取消、已归档生产单不更新。
          </p>
          <ul>
            {preview.productions?.map((p) => (
              <li key={p.id}>{p.document_number}</li>
            ))}
          </ul>
          {!preview.productions?.length && <p>没有可同步的未完成生产单。</p>}
          <Button
            disabled={busy || !preview.productions?.length}
            onClick={() => void sync(true)}
          >
            确认同步
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setPreview(null)}
          >
            取消同步
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

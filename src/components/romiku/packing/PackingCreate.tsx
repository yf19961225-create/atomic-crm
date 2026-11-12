import {
  saveDocumentAtomically,
  getDocumentCreationId,
  finishDocumentCreation,
  resolveDocumentSave,
  pendingDocumentIntent,
  retryPendingDocumentSave,
} from "../commercial/atomicDocumentSave";
import { useAppDraft } from "../updates/drafts";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDataProvider } from "ra-core";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../outbound/RelatedRecords";
import { OrderSelect } from "../production/fulfillmentShared";
import { defaultPackingSellerSnapshot } from "./packingExportSnapshot";
import { prepareOrderPackingList } from "./packingWorkflow";

export function PackingCreate() {
  const provider = useDataProvider(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || ""),
    [creationMode, setCreationMode] = useState<"order" | "independent">(
      "order",
    ),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [creationId] = useState(() => getDocumentCreationId("packing"));
  const pendingIntent = useRef<
    Parameters<typeof saveDocumentAtomically>[1] | null
  >(null);
  const inFlight = useRef(false);
  const [recovering, setRecovering] = useState(true);
  useEffect(() => {
    let alive = true;
    void pendingDocumentIntent(provider, "packing", creationId)
      .then((intent) => {
        if (!alive || !intent) return;
        pendingIntent.current = intent;
        setOrderId(String(intent.header.order_id || ""));
        setCreationMode(intent.header.order_id ? "order" : "independent");
        setFailure(
          "存在待确认的原保存请求。可查询结果，或按原内容重试；不会重新生成产品行或时间。",
        );
      })
      .catch((cause) => {
        if (alive) setFailure(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setRecovering(false);
      });
    return () => {
      alive = false;
    };
  }, [provider, creationId]);
  const [baseline, setBaseline] = useState(() => ({ orderId, creationMode }));
  useAppDraft(
    orderId !== baseline.orderId || creationMode !== baseline.creationMode,
  );
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const recovered = await resolveDocumentSave(
        provider,
        "packing",
        creationId,
      );
      if (recovered) {
        finishDocumentCreation("packing", creationId);
        setBaseline({ orderId, creationMode });
        navigate(`/packing-shipping/${recovered.header.id}`);
        return;
      }
      const isOrderBacked = creationMode === "order";
      if (isOrderBacked && !orderId) throw new Error("请选择订单。");
      if (!pendingIntent.current) {
        pendingIntent.current = isOrderBacked
          ? await prepareOrderPackingList(provider, orderId)
          : {
              kind: "packing",
              documentId: crypto.randomUUID(),
              expectedRevision: 0,
              items: [],
              header: {
                order_id: null,
                packing_at: new Date().toISOString(),
                seller_snapshot: defaultPackingSellerSnapshot(),
                buyer_snapshot: {},
              },
            };
      }
      pendingIntent.current.documentId = creationId;
      const result = await saveDocumentAtomically(
        provider,
        pendingIntent.current,
      );
      finishDocumentCreation("packing", creationId);
      setBaseline({ orderId, creationMode });
      navigate(`/packing-shipping/${result.header.id}`);
    } catch (cause) {
      const persisted = await pendingDocumentIntent(
        provider,
        "packing",
        creationId,
      ).catch(() => pendingIntent.current);
      if (!persisted) pendingIntent.current = null;
      setFailure(errorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="ds-page ds-create-page space-y-4">
      <Link className="underline" to="/packing-shipping">
        返回装箱与发运
      </Link>
      <h1 className="text-3xl font-semibold">新建装箱单</h1>
      <p>可从订单分配产品，也可直接建立独立装箱单。</p>
      <form onSubmit={create}>
        <fieldset disabled={busy || recovering} className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              disabled={Boolean(pendingIntent.current)}
              checked={creationMode === "order"}
              name="packing-create-mode"
              type="radio"
              onChange={() => setCreationMode("order")}
            />
            从 Order 创建
          </label>
          <label className="flex items-center gap-2">
            <input
              aria-label="直接创建 / 不关联订单"
              disabled={Boolean(pendingIntent.current)}
              checked={creationMode === "independent"}
              name="packing-create-mode"
              type="radio"
              onChange={() => setCreationMode("independent")}
            />
            直接创建 / 不关联订单
          </label>
          {creationMode === "order" && (
            <OrderSelect
              value={orderId}
              onChange={(value) => {
                if (!pendingIntent.current) setOrderId(value);
              }}
            />
          )}
          <Button type="submit" disabled={creationMode === "order" && !orderId}>
            创建装箱单
          </Button>
        </fieldset>
      </form>
      {failure && (
        <div>
          <p role="alert">{failure}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await resolveDocumentSave(
                  provider,
                  "packing",
                  creationId,
                );
                if (result) {
                  finishDocumentCreation("packing", creationId);
                  setBaseline({ orderId, creationMode });
                  navigate(`/packing-shipping/${result.header.id}`);
                } else setFailure("尚未查询到原保存结果，请稍后再查询。");
              } catch (cause) {
                setFailure(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            查询原保存结果
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true;
              setBusy(true);
              try {
                const result = await retryPendingDocumentSave(
                  provider,
                  "packing",
                  creationId,
                );
                finishDocumentCreation("packing", creationId);
                setBaseline({ orderId, creationMode });
                navigate(`/packing-shipping/${result.header.id}`);
              } catch (cause) {
                setFailure(errorMessage(cause));
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          >
            按原内容重试
          </Button>
        </div>
      )}
    </section>
  );
}

import type { DataProvider, RaRecord } from "ra-core";

export type AtomicDocumentKind = "quote" | "pi" | "order" | "packing";
export type DocumentSnapshot = {
  kind: AtomicDocumentKind;
  document_id: string;
  revision: number;
  header: RaRecord;
  items: RaRecord[];
};
export type AtomicDocumentIntent = {
  kind: AtomicDocumentKind;
  documentId: string;
  expectedRevision: number;
  header: Record<string, unknown>;
  items: Record<string, unknown>[] | null;
};
export type DocumentSaveRequest = AtomicDocumentIntent & { requestId: string };
export type AtomicDocumentProvider = {
  documentActor(): Promise<string>;
  documentSnapshot(args: {
    kind: AtomicDocumentKind;
    documentId: string;
  }): Promise<DocumentSnapshot>;
  documentSave(args: DocumentSaveRequest): Promise<DocumentSnapshot>;
  documentSaveResult(args: {
    requestId: string;
  }): Promise<DocumentSnapshot | null>;
};
const prefix = "romiku.document-save.v1:";
const running = new Map<string, Promise<DocumentSnapshot>>();
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
function client(provider: DataProvider): AtomicDocumentProvider {
  for (const key of [
    "documentActor",
    "documentSnapshot",
    "documentSave",
    "documentSaveResult",
  ])
    if (typeof provider[key] !== "function")
      throw new Error("事务保存接口尚未就绪，请升级服务后再保存。");
  return provider as unknown as AtomicDocumentProvider;
}
const keyFor = (actor: string, kind: AtomicDocumentKind, id: string) =>
  `${prefix}${actor}:${kind}:${id}`;
function readPending(key: string): DocumentSaveRequest | null {
  const raw = sessionStorage.getItem(key);
  return raw ? (JSON.parse(raw) as DocumentSaveRequest) : null;
}
const commercialFields = [
  "sku",
  "sanity_product_id",
  "quantity",
  "unit_price",
  "unit_price_entered",
  "source_cny_unit_price",
  "product_snapshot",
  "packing_snapshot",
  "requirement",
  "customer_code",
  "notes",
  "position",
];
const packingFields = [
  "source_order_item_id",
  "sku",
  "sanity_product_id",
  "product_snapshot",
  "quantity",
  "cartons",
  "qty_per_carton",
  "length_cm",
  "width_cm",
  "height_cm",
  "carton_weight_kg",
  "remark",
  "position",
];
/** Drop read-only/generated fields; preserve existing row IDs, never copy source lineage. */
export function atomicDocumentItems(
  kind: AtomicDocumentKind,
  items: Record<string, unknown>[] | null,
) {
  if (items === null) return null;
  return items.map((item) => {
    const fields =
      kind === "packing"
        ? packingFields
        : commercialFields.filter(
            (field) => kind === "quote" || field !== "source_cny_unit_price",
          );
    const row = Object.fromEntries(
      fields
        .filter((key) => item[key] !== undefined)
        .map((key) => [key, item[key]]),
    );
    if (item.id && !String(item.id).startsWith("draft-")) row.id = item.id;
    return row;
  });
}
export async function readDocumentSnapshot(
  provider: DataProvider,
  kind: AtomicDocumentKind,
  documentId: string,
) {
  return client(provider).documentSnapshot({ kind, documentId });
}
/** Result lookup is read-only; a missing result is NOT proof that an in-flight transaction failed. */
export async function resolveDocumentSave(
  provider: DataProvider,
  kind: AtomicDocumentKind,
  documentId: string,
) {
  const api = client(provider);
  const actor = await api.documentActor();
  const key = keyFor(actor, kind, documentId);
  const pending = readPending(key);
  if (!pending) return null;
  const result = await api.documentSaveResult({ requestId: pending.requestId });
  if (result) sessionStorage.removeItem(key);
  return result;
}
/** Never automatically replays a write. Explicit identical retries keep the durable request identity. */
export async function saveDocumentAtomically(
  provider: DataProvider,
  intent: AtomicDocumentIntent,
): Promise<DocumentSnapshot> {
  intent = structuredClone(intent);
  const api = client(provider);
  const actor = await api.documentActor();
  if (!actor) throw new Error("请重新登录后保存。");
  const normalized = {
    ...intent,
    items: atomicDocumentItems(intent.kind, intent.items),
  };
  if (
    !Number.isSafeInteger(intent.expectedRevision) ||
    intent.expectedRevision < 0
  )
    throw new Error("单据版本缺失，请保留草稿并重新加载。");
  const key = keyFor(actor, intent.kind, intent.documentId);
  const pending = readPending(key);
  if (pending) {
    const { requestId: _requestId, ...previous } = pending;
    if (stable(previous) !== stable(normalized))
      throw new Error(
        "原保存结果尚未确认，请先查询原保存结果；编辑内容已保留。",
      );
  }
  const inFlight = running.get(key);
  if (inFlight) return inFlight;
  const request = pending ?? { ...normalized, requestId: crypto.randomUUID() };
  // Persist before dispatch. Storage failures stop the write instead of losing recovery identity.
  sessionStorage.setItem(key, JSON.stringify(request));
  const task = (async () => {
    if (pending) {
      const prior = await api.documentSaveResult({
        requestId: request.requestId,
      });
      if (prior) {
        sessionStorage.removeItem(key);
        return prior;
      }
    }
    try {
      const result = await api.documentSave(request);
      sessionStorage.removeItem(key);
      return result;
    } catch (cause) {
      try {
        const result = await api.documentSaveResult({
          requestId: request.requestId,
        });
        if (result) {
          sessionStorage.removeItem(key);
          return result;
        }
      } catch {
        /* Keep exact intent; a failed read cannot decide commit outcome. */
      }
      const code = (cause as { code?: string })?.code;
      if (code && /^(PT|22|23|28|42|P0)/.test(code)) {
        sessionStorage.removeItem(key);
        throw cause;
      }
      throw new Error(
        "保存结果尚未确认，编辑内容已保留。请查询原保存结果，或在网络恢复后以相同内容重试；不要另建重复单据。",
        { cause },
      );
    }
  })();
  running.set(key, task);
  try {
    return await task;
  } finally {
    running.delete(key);
  }
}

export const documentKindForResource = (
  resource: string,
): AtomicDocumentKind | undefined =>
  (
    ({
      romiku_quotes: "quote",
      romiku_pis: "pi",
      romiku_orders: "order",
      romiku_packing_lists: "packing",
    }) as Record<string, AtomicDocumentKind>
  )[resource];

/** A list patch may only overwrite the displayed field if that value is still current. */
export async function saveDocumentHeaderPatch(
  provider: DataProvider,
  kind: AtomicDocumentKind,
  previous: RaRecord,
  patch: Record<string, unknown>,
) {
  const pending = await pendingDocumentIntent(
    provider,
    kind,
    String(previous.id),
  );
  if (pending) {
    if (pending.items !== null || stable(pending.header) !== stable(patch))
      throw new Error("原保存结果尚未确认，请保留输入并先按原内容查询或重试。");
    return saveDocumentAtomically(provider, pending);
  }
  const snapshot = await readDocumentSnapshot(
    provider,
    kind,
    String(previous.id),
  );
  for (const field of Object.keys(patch))
    if (
      stable(snapshot.header[field] ?? null) !== stable(previous[field] ?? null)
    )
      throw new Error("此字段已由其他用户修改，请刷新核对；输入已保留。");
  return saveDocumentAtomically(provider, {
    kind,
    documentId: String(previous.id),
    expectedRevision: snapshot.revision,
    header: patch,
    items: null,
  });
}

/** Persist only the client-created UUID so a refreshed create page can query its original outcome. */
export function getDocumentCreationId(
  kind: AtomicDocumentKind,
  scope = "create",
) {
  const key = `${prefix}creation:${kind}:${scope}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}
export function finishDocumentCreation(
  kind: AtomicDocumentKind,
  documentId: string,
  scope = "create",
) {
  const key = `${prefix}creation:${kind}:${scope}`;
  if (sessionStorage.getItem(key) === documentId)
    sessionStorage.removeItem(key);
}

export type DocumentSourceIntent = {
  sourceKind: "quote" | "pi" | "inquiry";
  sourceId: string;
  targetKind: "quote" | "pi" | "order";
  selectedItemIds?: string[];
  expectedSourceRevision?: number;
};
const sourceIdFor = (intent: DocumentSourceIntent) =>
  `source:${intent.sourceKind}:${intent.sourceId}:${intent.targetKind}`;
/** Conversion keeps the existing server snapshot/conversion rules inside the durable request transaction. */
export async function createDocumentFromSource(
  provider: DataProvider,
  intent: DocumentSourceIntent,
): Promise<DocumentSnapshot> {
  const api = client(provider);
  const actor = await api.documentActor();
  if (typeof provider.documentCreateFromSource !== "function")
    throw new Error("事务转换接口尚未就绪。");
  const key = keyFor(actor, intent.targetKind, sourceIdFor(intent));
  const pendingRaw = sessionStorage.getItem(key);
  const pending = pendingRaw
    ? (JSON.parse(pendingRaw) as DocumentSourceIntent & { requestId: string })
    : null;
  if (pending) {
    const { requestId: _id, ...old } = pending;
    if (stable(old) !== stable(intent))
      throw new Error("请先查询原保存结果，不能更改待确认的来源选择。");
  }
  const active = running.get(key);
  if (active) return active;
  const request = pending ?? { ...intent, requestId: crypto.randomUUID() };
  sessionStorage.setItem(key, JSON.stringify(request));
  const task = (async () => {
    if (pending) {
      const prior = await api.documentSaveResult({
        requestId: request.requestId,
      });
      if (prior) {
        sessionStorage.removeItem(key);
        return prior;
      }
    }
    try {
      const result = (await provider.documentCreateFromSource(
        request,
      )) as DocumentSnapshot;
      sessionStorage.removeItem(key);
      return result;
    } catch (cause) {
      try {
        const result = await api.documentSaveResult({
          requestId: request.requestId,
        });
        if (result) {
          sessionStorage.removeItem(key);
          return result;
        }
      } catch {
        /* Read failure does not prove rollback. */
      }
      const code = (cause as { code?: string })?.code;
      if (code && /^(PT|22|23|28|42|P0)/.test(code)) {
        sessionStorage.removeItem(key);
        throw cause;
      }
      throw new Error(
        "转换结果尚未确认，请查询原保存结果后再继续；不会自动重新创建单据。",
        { cause },
      );
    }
  })();
  running.set(key, task);
  try {
    return await task;
  } finally {
    running.delete(key);
  }
}
export async function resolveDocumentSource(
  provider: DataProvider,
  intent: DocumentSourceIntent,
) {
  return resolveDocumentSave(provider, intent.targetKind, sourceIdFor(intent));
}
export async function pendingDocumentIntent(
  provider: DataProvider,
  kind: AtomicDocumentKind,
  documentId: string,
): Promise<AtomicDocumentIntent | null> {
  const actor = await client(provider).documentActor();
  const pending = readPending(keyFor(actor, kind, documentId));
  if (!pending) return null;
  const { requestId: _requestId, ...intent } = pending;
  return structuredClone(intent);
}
/** User-requested retry of the persisted exact request; never regenerates timestamps, line IDs or financial intent. */
export async function retryPendingDocumentSave(
  provider: DataProvider,
  kind: AtomicDocumentKind,
  documentId: string,
) {
  const intent = await pendingDocumentIntent(provider, kind, documentId);
  if (!intent) throw new Error("没有待确认的原保存请求，请重新核对当前草稿。");
  return saveDocumentAtomically(provider, intent);
}

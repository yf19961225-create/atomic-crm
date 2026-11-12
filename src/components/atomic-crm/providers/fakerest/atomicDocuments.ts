/** Explicit FakeRest-only transaction model for the local demo and browser tests. Not a substitute for PostgreSQL permissions or concurrency. */
import type { DataProvider } from "ra-core";
import type {
  AtomicDocumentKind,
  AtomicDocumentProvider,
  DocumentSourceIntent,
  DocumentSaveRequest,
  DocumentSnapshot,
} from "@/components/romiku/commercial/atomicDocumentSave";
const config = {
  quote: ["romiku_quotes", "romiku_quote_items", "quote_id"],
  pi: ["romiku_pis", "romiku_pi_items", "pi_id"],
  order: ["romiku_orders", "romiku_order_items", "order_id"],
  packing: ["romiku_packing_lists", "romiku_packing_items", "packing_list_id"],
} as const;
const list = {
  pagination: { page: 1, perPage: 10000 },
  sort: { field: "position", order: "ASC" as const },
};
export function withFakeAtomicDocuments<T extends DataProvider>(
  provider: T,
): T &
  AtomicDocumentProvider & {
    documentCreateFromSource(
      request: DocumentSourceIntent & { requestId: string },
    ): Promise<DocumentSnapshot>;
  } {
  const base = {
    create: provider.create.bind(provider),
    update: provider.update.bind(provider),
    delete: provider.delete.bind(provider),
    getOne: provider.getOne.bind(provider),
    getList: provider.getList.bind(provider),
  };
  const journal = new Map<string, { hash: string; result: DocumentSnapshot }>();
  const snapshot = async ({
    kind,
    documentId,
  }: {
    kind: AtomicDocumentKind;
    documentId: string;
  }): Promise<DocumentSnapshot> => {
    const [table, lines, fk] = config[kind];
    const { data } = await provider.getOne(table, { id: documentId });
    const rows = await provider.getList(lines, {
      ...list,
      filter: { [fk]: documentId },
    });
    return {
      kind,
      document_id: documentId,
      revision: Number(data.revision ?? 1),
      header: { ...data, revision: Number(data.revision ?? 1) },
      items: rows.data,
    };
  };
  Object.assign(provider, {
    documentActor: async () => "local-browser-test-actor",
    documentCreateFromSource: async () => {
      throw new Error("来源转换需要已配置的服务端事务接口。");
    },
    documentSnapshot: snapshot,
    documentSaveResult: async ({ requestId }: { requestId: string }) =>
      journal.get(requestId)?.result ?? null,
    documentSave: async (
      request: DocumentSaveRequest,
    ): Promise<DocumentSnapshot> => {
      const hash = JSON.stringify(request);
      const prior = journal.get(request.requestId);
      if (prior) {
        if (prior.hash !== hash)
          throw Object.assign(new Error("REQUEST_CONFLICT"), { code: "PT409" });
        return structuredClone(prior.result);
      }
      const [table, lines, fk] = config[request.kind];
      let before: DocumentSnapshot | undefined;
      if (request.expectedRevision !== 0)
        before = await snapshot({
          kind: request.kind,
          documentId: request.documentId,
        });
      if (before && before.revision !== request.expectedRevision)
        throw Object.assign(new Error("REVISION_CONFLICT"), { code: "PT409" });
      const beforeIds = new Set(
        before?.items.map((row) => String(row.id)) ?? [],
      );
      try {
        if (before)
          await provider.update(table, {
            id: request.documentId,
            data: request.header,
            previousData: before.header,
          });
        else
          await provider.create(table, {
            data: { ...request.header, id: request.documentId, revision: 0 },
          });
        if (request.items !== null) {
          const ids = new Set(request.items.map((row) => String(row.id ?? "")));
          for (const old of before?.items ?? [])
            if (!ids.has(String(old.id)))
              await provider.delete(lines, { id: old.id, previousData: old });
          for (const row of request.items) {
            if (row.id) {
              if (beforeIds.has(String(row.id)))
                await provider.update(lines, {
                  id: String(row.id),
                  data: row,
                  previousData: before!.items.find((old) => old.id === row.id),
                });
              else
                await provider.create(lines, {
                  data: {
                    ...row,
                    [fk]: request.documentId,
                    ...(request.kind === "packing"
                      ? {
                          order_id:
                            request.header.order_id ??
                            before?.header.order_id ??
                            null,
                        }
                      : {}),
                  },
                });
            } else
              await provider.create(lines, {
                data: {
                  ...row,
                  id: crypto.randomUUID(),
                  [fk]: request.documentId,
                  ...(request.kind === "packing"
                    ? {
                        order_id:
                          request.header.order_id ??
                          before?.header.order_id ??
                          null,
                      }
                    : {}),
                },
              });
          }
        }
        await base.update(table, {
          id: request.documentId,
          data: { revision: request.expectedRevision + 1 },
          previousData: before?.header ?? { id: request.documentId },
        });
        const result = await snapshot({
          kind: request.kind,
          documentId: request.documentId,
        });
        journal.set(request.requestId, { hash, result });
        return result;
      } catch (cause) {
        const current = (
          await base.getList(lines, {
            ...list,
            filter: {
              [fk]: request.documentId,
              ...(request.kind === "packing"
                ? {
                    order_id:
                      request.header.order_id ??
                      before?.header.order_id ??
                      null,
                  }
                : {}),
            },
          })
        ).data;
        for (const row of current) await base.delete(lines, { id: row.id });
        for (const row of before?.items ?? [])
          await base.create(lines, { data: row });
        if (before)
          await base.update(table, {
            id: request.documentId,
            data: before.header,
            previousData: before.header,
          });
        else {
          try {
            await base.delete(table, { id: request.documentId });
          } catch {
            /* No header was created. */
          }
        }
        // A modelled transaction exception is a definite rollback, not a transport loss.
        throw Object.assign(
          cause instanceof Error ? cause : new Error(String(cause)),
          { code: "PT400" },
        );
      }
    },
  });
  return provider as T &
    AtomicDocumentProvider & {
      documentCreateFromSource(
        request: DocumentSourceIntent & { requestId: string },
      ): Promise<DocumentSnapshot>;
    };
}

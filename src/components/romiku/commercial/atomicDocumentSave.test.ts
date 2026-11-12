import { beforeEach, expect, it, vi } from "vitest";
import type { DataProvider } from "ra-core";
import {
  saveDocumentAtomically,
  resolveDocumentSave,
  readDocumentSnapshot,
} from "./atomicDocumentSave";
const intent = {
  kind: "order" as const,
  documentId: "11111111-1111-4111-8111-111111111111",
  expectedRevision: 1,
  header: { notes: "draft" },
  items: [],
};
const result = {
  kind: "order",
  document_id: intent.documentId,
  revision: 2,
  header: { id: intent.documentId, notes: "draft" },
  items: [],
};
function provider() {
  const committed = new Map<string, unknown>();
  const p = {
    documentActor: async () => "actor-a",
    documentSnapshot: async () => result,
    documentSave: vi.fn(async (args: { requestId: string }) => {
      committed.set(args.requestId, result);
      return result;
    }),
    documentSaveResult: vi.fn(
      async ({ requestId }: { requestId: string }) =>
        committed.get(requestId) ?? null,
    ),
  };
  return { p, committed, dp: p as unknown as DataProvider };
}
beforeEach(() => sessionStorage.clear());
it("uses one atomic call and recovers a committed response loss without a second write", async () => {
  const { p, committed, dp } = provider();
  p.documentSave.mockImplementationOnce(async (args) => {
    committed.set(args.requestId, result);
    throw new TypeError("network lost");
  });
  expect(await saveDocumentAtomically(dp, intent)).toEqual(result);
  expect(p.documentSave).toHaveBeenCalledTimes(1);
});
it("retains request ID and exact payload for an explicit identical retry", async () => {
  const { p, dp } = provider();
  p.documentSave.mockRejectedValueOnce(new TypeError("network lost"));
  await expect(saveDocumentAtomically(dp, intent)).rejects.toThrow(
    "结果尚未确认",
  );
  expect(await saveDocumentAtomically(dp, intent)).toEqual(result);
  expect(p.documentSave.mock.calls[0][0]).toEqual(
    p.documentSave.mock.calls[1][0],
  );
});
it("refuses changed content while the original request is unresolved", async () => {
  const { p, dp } = provider();
  p.documentSave.mockRejectedValueOnce(new TypeError("lost"));
  await expect(saveDocumentAtomically(dp, intent)).rejects.toThrow();
  await expect(
    saveDocumentAtomically(dp, { ...intent, header: { notes: "different" } }),
  ).rejects.toThrow("原保存结果");
  expect(p.documentSave).toHaveBeenCalledTimes(1);
});
it("queries a persisted request after reload without writing", async () => {
  const { p, committed, dp } = provider();
  p.documentSave.mockRejectedValueOnce(new TypeError("lost"));
  await expect(saveDocumentAtomically(dp, intent)).rejects.toThrow();
  committed.set(p.documentSave.mock.calls[0][0].requestId, result);
  expect(await resolveDocumentSave(dp, "order", intent.documentId)).toEqual(
    result,
  );
  expect(p.documentSave).toHaveBeenCalledTimes(1);
});
it("does not reuse another actor's pending request", async () => {
  const { p, dp } = provider();
  p.documentSave.mockRejectedValueOnce(new TypeError("lost"));
  await expect(saveDocumentAtomically(dp, intent)).rejects.toThrow();
  p.documentActor = async () => "actor-b";
  expect(await resolveDocumentSave(dp, "order", intent.documentId)).toBeNull();
});
it("releases definitive validation rejection but preserves a revision conflict as an error", async () => {
  const { p, dp } = provider();
  p.documentSave.mockRejectedValueOnce(
    Object.assign(new Error("revision conflict"), { code: "PT409" }),
  );
  await expect(saveDocumentAtomically(dp, intent)).rejects.toThrow(
    "revision conflict",
  );
  expect(
    await saveDocumentAtomically(dp, { ...intent, expectedRevision: 2 }),
  ).toEqual(result);
});
it("fails closed when the provider has no transactional contract", async () => {
  await expect(
    readDocumentSnapshot({} as DataProvider, "order", intent.documentId),
  ).rejects.toThrow("事务保存接口");
});
it("coalesces same-editor repeated submission and does not start a second write", async () => {
  const { p, dp } = provider();
  let release!: () => void;
  p.documentSave.mockImplementationOnce(async () => {
    await new Promise<void>((r) => (release = r));
    return result;
  });
  const first = saveDocumentAtomically(dp, intent);
  const second = saveDocumentAtomically(dp, intent);
  await vi.waitFor(() => expect(p.documentSave).toHaveBeenCalledTimes(1));
  release();
  expect(await first).toEqual(await second);
  expect(p.documentSave).toHaveBeenCalledTimes(1);
});
it("does not dispatch when durable intent storage is unavailable", async () => {
  const { p, dp } = provider();
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
  try {
    await expect(saveDocumentAtomically(dp, intent)).rejects.toThrow();
    expect(p.documentSave).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
it("freezes nested payload before asynchronous identity lookup", async () => {
  const { p, dp } = provider();
  let release!: (value: string) => void;
  p.documentActor = () => new Promise<string>((r) => (release = r));
  const draft = structuredClone(intent);
  const saving = saveDocumentAtomically(dp, draft);
  draft.header.notes = "later edit";
  release("actor-a");
  await saving;
  expect(p.documentSave.mock.calls[0][0]).toMatchObject({
    header: { notes: "draft" },
  });
});

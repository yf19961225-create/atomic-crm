import { test } from "node:test";
import assert from "node:assert/strict";
import { submitProductionInquiry } from "../public/submission.mjs";
const makeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("CRM success and partial mail failure retry the original ID and snapshot", async () => {
  const storage = makeStorage();
  const sent = [];
  let done = false;
  const fetcher = async (url, opts) =>
    url.includes("csrf")
      ? { ok: true, json: async () => ({ csrf: "token" }) }
      : {
          ok: done,
          status: done ? 200 : 503,
          json: async () => {
            sent.push(JSON.parse(opts.body));
            return {
              ok: done,
              crmSaved: true,
              document_number: "WI-000001",
              notifications: {
                internal: "sent",
                customer: done ? "sent" : "pending",
              },
            };
          },
        };
  const opts = { storage, fetcher, uuid: () => "stable-id" };
  await submitProductionInquiry({ customer: { name: "Original" } }, opts);
  done = true;
  await submitProductionInquiry({ customer: { name: "Changed" } }, opts);
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(
    storage.getItem("romiku-production-inquiry-pending-v1"),
    undefined,
  );
});
test("ambiguous network failure preserves pending; definitive validation permits edit", async () => {
  const storage = makeStorage();
  const opts = {
    storage,
    uuid: () => "stable-id",
    fetcher: async () => {
      throw Error("offline");
    },
  };
  await assert.rejects(submitProductionInquiry({ customer: {} }, opts));
  assert.ok(storage.getItem("romiku-production-inquiry-pending-v1"));
  opts.fetcher = async (url) =>
    url.includes("csrf")
      ? { ok: true, json: async () => ({ csrf: "token" }) }
      : {
          ok: false,
          status: 422,
          json: async () => ({ code: "VALIDATION_ERROR" }),
        };
  await submitProductionInquiry({ customer: {} }, opts);
  assert.equal(
    JSON.parse(storage.getItem("romiku-production-inquiry-pending-v1"))
      .submissionId,
    "stable-id",
  );
});

test("a legacy ok response never counts as a saved CRM inquiry", async () => {
  const storage = makeStorage();
  await assert.rejects(
    submitProductionInquiry(
      { customer: {} },
      {
        storage,
        uuid: () => "123e4567-e89b-42d3-a456-426614174000",
        fetcher: async (url) => ({
          ok: true,
          status: 200,
          json: async () =>
            url.includes("csrf")
              ? { csrf: "token" }
              : { ok: true, crmSynced: false },
        }),
      },
    ),
    /receipt|saved/i,
  );
  assert.ok(storage.getItem("romiku-production-inquiry-pending-v1"));
});

test("HTTP failure cannot be promoted to success by an ok body", async () => {
  const storage = makeStorage();
  await assert.rejects(
    submitProductionInquiry(
      {},
      {
        storage,
        uuid: () => "123e4567-e89b-42d3-a456-426614174000",
        fetcher: async (url) => ({
          ok: url.includes("csrf"),
          status: url.includes("csrf") ? 200 : 503,
          json: async () =>
            url.includes("csrf")
              ? { csrf: "token" }
              : {
                  ok: true,
                  crmSaved: true,
                  notifications: { internal: "sent", customer: "sent" },
                },
        }),
      },
    ),
    /receipt|response|saved/i,
  );
});

test("refresh can recover original customer, order, decimal quantities and product notes", async () => {
  const mod = await import("../public/submission.mjs");
  assert.equal(typeof mod.readPendingInquiry, "function");
  const storage = makeStorage();
  const payload = {
    customer: { name: "QA", whatsapp: "+12345678900", notes: "draft" },
    products: [
      { sku: "Ab-01", qty: 1.25, notes: "first" },
      { sku: "OTHER", qty: 2 },
    ],
  };
  await assert.rejects(
    submitProductionInquiry(payload, {
      storage,
      uuid: () => "123e4567-e89b-42d3-a456-426614174000",
      fetcher: async () => {
        throw Error("offline");
      },
    }),
  );
  assert.deepEqual(mod.readPendingInquiry(storage).products, payload.products);
  assert.deepEqual(mod.readPendingInquiry(storage).customer, payload.customer);
});

test("ok without confirmed notifications cannot clear the cart", async () => {
  const storage = makeStorage();
  await assert.rejects(
    submitProductionInquiry(
      {},
      {
        storage,
        uuid: () => "123e4567-e89b-42d3-a456-426614174000",
        fetcher: async (url) => ({
          ok: true,
          status: 200,
          json: async () =>
            url.includes("csrf")
              ? { csrf: "token" }
              : {
                  ok: true,
                  crmSaved: true,
                  document_number: "WI-000001",
                  notifications: {
                    internal: "sent",
                    customer: "review_required",
                  },
                },
        }),
      },
    ),
    /notification/i,
  );
  assert.ok(storage.getItem("romiku-production-inquiry-pending-v1"));
});

test("late completion cannot erase a newer inquiry pending in another tab", async () => {
  const storage = makeStorage();
  let finish;
  const response = new Promise((resolve) => {
    finish = resolve;
  });
  const old = submitProductionInquiry(
    { customer: { name: "A" } },
    {
      storage,
      uuid: () => "123e4567-e89b-42d3-a456-426614174001",
      fetcher: async (url) =>
        url.includes("csrf")
          ? { ok: true, json: async () => ({ csrf: "test" }) }
          : response,
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  const next = {
    submissionId: "123e4567-e89b-42d3-a456-426614174002",
    customer: { name: "B" },
  };
  storage.setItem("romiku-production-inquiry-pending-v1", JSON.stringify(next));
  finish({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      crmSaved: true,
      document_number: "WI-1",
      notifications: { internal: "sent", customer: "sent" },
    }),
  });
  await assert.rejects(old, /changed|another/i);
  assert.deepEqual(
    JSON.parse(storage.getItem("romiku-production-inquiry-pending-v1")),
    next,
  );
});

test("retrying a saved snapshot reports that newer customer edits must be retained", async () => {
  const storage = makeStorage();
  storage.setItem(
    "romiku-production-inquiry-pending-v1",
    JSON.stringify({
      submissionId: "123e4567-e89b-42d3-a456-426614174001",
      customer: { name: "Original" },
      products: [{ sku: "005", qty: 1, notes: "old" }],
    }),
  );
  let sent;
  const result = await submitProductionInquiry(
    {
      customer: { name: "Changed" },
      products: [{ sku: "005", qty: 2, notes: "new" }],
    },
    {
      storage,
      fetcher: async (url, options) =>
        url.includes("csrf")
          ? { ok: true, json: async () => ({ csrf: "test" }) }
          : {
              ok: true,
              status: 200,
              json: async () => {
                sent = JSON.parse(options.body);
                return {
                  ok: true,
                  crmSaved: true,
                  document_number: "WI-1",
                  notifications: { internal: "sent", customer: "sent" },
                };
              },
            },
    },
  );
  assert.equal(sent.customer.name, "Original");
  assert.equal(result.draftPreserved, true);
});

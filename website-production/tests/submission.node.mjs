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
    storage.getItem("romiku-production-inquiry-pending-v1"),
    undefined,
  );
});

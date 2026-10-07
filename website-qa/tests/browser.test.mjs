import { test } from "node:test";
import assert from "node:assert/strict";
import { createSubmission } from "../public/submission.mjs";
const store = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("CRM/network failure keeps cart, customer and UUID across reload/retry", async () => {
  const s = store();
  let sent;
  const create = () => createSubmission(s, () => "uuid-1");
  let flow = create();
  const draft = {
    customer: { email: "x@example.test" },
    products: [{ sku: "SUN5", qty: 120 }],
  };
  flow.saveDraft(draft);
  await assert.rejects(
    flow.submit(async (body) => {
      sent = body;
      throw Error("offline");
    }),
  );
  assert.equal(sent.submissionId, "uuid-1");
  flow = create();
  assert.deepEqual(flow.draft(), draft);
  await assert.rejects(
    flow.submit(async (body) => {
      assert.deepEqual(body, sent);
      return { success: false, crmSaved: false };
    }),
  );
  assert.equal(flow.id(), "uuid-1");
});
test("pending notifications keep same submission and receipt; complete explicitly starts new inquiry", async () => {
  const s = store();
  let num = 0;
  const f = createSubmission(s, () => `uuid-${++num}`);
  f.saveDraft({
    customer: { email: "a@b.test" },
    products: [{ sku: "SUN5", qty: 120 }],
  });
  await assert.rejects(
    f.submit(async () => ({
      success: false,
      crmSaved: true,
      document_number: "WI-1",
    })),
  );
  assert.equal(f.id(), "uuid-1");
  await f.submit(async () => ({
    success: true,
    crmSaved: true,
    document_number: "WI-1",
  }));
  assert.equal(f.id(), "uuid-1");
  assert.equal(f.receipt().document_number, "WI-1");
  f.startNew();
  assert.equal(f.id(), "uuid-2");
  assert.deepEqual(f.draft(), { customer: {}, products: [] });
});
test("freeze first submitted data during retry and persist before network", async () => {
  const s = store();
  const f = createSubmission(s, () => "same");
  f.saveDraft({
    customer: { email: "first@test.test" },
    products: [{ sku: "SUN5", qty: 120 }],
  });
  await assert.rejects(
    f.submit(async () => {
      throw Error("timeout");
    }),
  );
  f.saveDraft({
    customer: { email: "changed@test.test" },
    products: [{ sku: "SUN5", qty: 240 }],
  });
  await f.submit(async (body) => {
    assert.equal(body.products[0].qty, 120);
    assert.equal(body.customer.email, "first@test.test");
    return { success: true, crmSaved: true };
  });
});
test("definite validation rejection permits correction without changing submission ID", async () => {
  const f = createSubmission(store(), () => "same");
  f.saveDraft({
    customer: { email: "bad" },
    products: [{ sku: "UNKNOWN", qty: 1 }],
  });
  await assert.rejects(
    f.submit(async () => ({
      success: false,
      crmSaved: false,
      code: "VALIDATION_ERROR",
    })),
  );
  assert.equal(f.pending(), false);
  f.saveDraft({
    customer: { email: "valid@test.test" },
    products: [{ sku: "SUN5", qty: 120 }],
  });
  await f.submit(async (body) => {
    assert.equal(body.submissionId, "same");
    assert.equal(body.products[0].sku, "SUN5");
    return { success: true, crmSaved: true };
  });
});
test("country/company/brand validation replies keep customer editable and UUID stable", async () => {
  for (const [field, value] of [
    ["market", ""],
    ["company", "C".repeat(201)],
    ["brand", "B".repeat(201)],
  ]) {
    const f = createSubmission(store(), () => "same");
    f.saveDraft({
      customer: {
        name: "Tester",
        email: "valid@test.test",
        market: "Colombia",
        [field]: value,
      },
      products: [{ sku: "SUN5", qty: 120 }],
    });
    await assert.rejects(
      f.submit(async () => ({
        success: false,
        crmSaved: false,
        code: "VALIDATION_ERROR",
      })),
    );
    assert.equal(f.pending(), false);
    const draft = f.draft();
    draft.customer[field] = field === "market" ? "Colombia" : "Corrected";
    f.saveDraft(draft);
    assert.equal(f.draft().customer[field], draft.customer[field]);
    assert.equal(f.id(), "same");
  }
});

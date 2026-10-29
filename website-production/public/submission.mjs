// Integrate the existing form through this module; preserve its visible fields/cart.
const key = "romiku-production-inquiry-pending-v1";
export function sameInquiryDraft(a, b) {
  const fields = (value) => ({
    customer: Object.fromEntries(
      ["name", "company", "brand", "email", "whatsapp", "market", "notes"].map(
        (k) => [k, String(value.customer?.[k] || "").trim()],
      ),
    ),
    products: (value.products || []).map((p) => ({
      sku: p.sku,
      qty: Number(p.qty),
      notes: String(p.notes || "").trim(),
    })),
  });
  return JSON.stringify(fields(a)) === JSON.stringify(fields(b));
}
export function readPendingInquiry(storage = localStorage) {
  // Corrupt state must not silently allocate a new UUID and duplicate a saved inquiry.
  const pending = JSON.parse(storage.getItem(key) || "null");
  if (
    pending !== null &&
    (!pending ||
      typeof pending !== "object" ||
      typeof pending.submissionId !== "string")
  )
    throw new Error(
      "Pending inquiry state unavailable; contact support before retrying",
    );
  return pending;
}
export async function submitProductionInquiry(
  payload,
  {
    storage = localStorage,
    fetcher = fetch,
    uuid = () => crypto.randomUUID(),
  } = {},
) {
  let pending = readPendingInquiry(storage);
  if (!pending || pending._editable === true) {
    pending = { ...payload, submissionId: pending?.submissionId || uuid() };
    storage.setItem(key, JSON.stringify(pending));
  }
  const tokenResponse = await fetcher("/api/submit-rfq.php?csrf=1", {
    credentials: "same-origin",
  });
  if (!tokenResponse.ok)
    throw new Error("Inquiry temporarily unavailable; saved for retry");
  const { csrf } = await tokenResponse.json();
  const response = await fetcher("/api/submit-rfq.php", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-ROMIKU-CSRF": csrf },
    body: JSON.stringify(pending),
  });
  const result = await response.json();
  if (readPendingInquiry(storage)?.submissionId !== pending.submissionId)
    throw new Error(
      "Pending inquiry changed in another tab; keep the current draft",
    );
  if (response.status === 422 && result.code === "VALIDATION_ERROR") {
    storage.setItem(key, JSON.stringify({ ...pending, _editable: true }));
    return result;
  }
  if (
    result.ok &&
    (!response.ok ||
      result.crmSaved !== true ||
      !/^WI-[A-Za-z0-9-]+$/.test(result.document_number || ""))
  )
    throw new Error("Invalid CRM saved receipt; retry the same submission");
  if (
    result.crmSaved &&
    !/^WI-[A-Za-z0-9-]+$/.test(result.document_number || "")
  )
    throw new Error("Invalid CRM saved receipt; retry the same submission");
  if (
    result.ok &&
    (result.notifications?.internal !== "sent" ||
      result.notifications?.customer !== "sent")
  )
    throw new Error("Invalid notification receipt; retry the same submission");
  if (
    response.ok &&
    result.ok &&
    result.crmSaved &&
    result.notifications?.internal === "sent" &&
    result.notifications?.customer === "sent"
  )
    storage.removeItem(key);

  return { ...result, draftPreserved: !sameInquiryDraft(pending, payload) };
}

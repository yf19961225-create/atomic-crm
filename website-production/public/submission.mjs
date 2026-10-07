// Integrate the existing form through this module; preserve its visible fields/cart.
const key = "romiku-production-inquiry-pending-v1";
export async function submitProductionInquiry(
  payload,
  {
    storage = localStorage,
    fetcher = fetch,
    uuid = () => crypto.randomUUID(),
  } = {},
) {
  let pending = JSON.parse(storage.getItem(key) || "null");
  if (!pending) {
    pending = { ...payload, submissionId: uuid() };
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
  if (
    response.ok &&
    result.ok &&
    result.crmSaved &&
    result.notifications?.internal === "sent" &&
    result.notifications?.customer === "sent"
  )
    storage.removeItem(key);
  if (response.status === 422 && result.code === "VALIDATION_ERROR")
    storage.removeItem(key);
  return result;
}

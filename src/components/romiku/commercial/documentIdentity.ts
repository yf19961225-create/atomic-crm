/** Internal display only. Exports and business links keep formal numbers/UUIDs. */
export function documentTitle(
  record: Record<string, unknown>,
  fallback = "未编号单据",
): string {
  const name =
    typeof record.document_name === "string" ? record.document_name.trim() : "";
  return name || String(record.document_number || fallback);
}

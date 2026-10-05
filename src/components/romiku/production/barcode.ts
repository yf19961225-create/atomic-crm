export const normalizeBarcode = (value: unknown): string | null =>
  typeof value === "string" ? value.trim() || null : null;
export function validateBarcode(
  value: unknown,
): { ok: true } | { ok: false; message: string; suggestion?: string } {
  const v = normalizeBarcode(value);
  if (value != null && typeof value !== "string")
    return { ok: false, message: "EAN-13 必须以文本输入 13 位数字。" };
  if (!v) return { ok: true };
  if (!/^[0-9]{13}$/.test(v))
    return { ok: false, message: "EAN-13 必须是 13 位纯数字。" };
  const check = String(
    (10 -
      ([...v.slice(0, 12)].reduce(
        (n, c, i) => n + Number(c) * (i % 2 ? 3 : 1),
        0,
      ) %
        10)) %
      10,
  );
  return v[12] === check
    ? { ok: true }
    : {
        ok: false,
        message: `EAN-13 校验位不正确。根据前 12 位计算的正确校验位为 ${check}。`,
        suggestion: v.slice(0, 12) + check,
      };
}
export function previewBarcodePaste(
  text: string,
  items: {
    id: string | number;
    sku?: string;
    barcode_number?: string | null;
  }[],
) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim());
  if (/^sku\t/i.test(lines[0] || "")) lines.shift();
  const rows = lines.map((line) => {
    const [skuRaw, value = "", ...extra] = line.split("\t");
    const sku = skuRaw.trim(),
      barcode = normalizeBarcode(value),
      matched = items.filter((i) => i.sku === sku),
      valid = validateBarcode(barcode);
    return {
      sku,
      barcode,
      id: matched.length === 1 ? matched[0].id : undefined,
      error: extra.length
        ? "仅支持 SKU 与条形码两列。"
        : matched.length === 0
          ? "当前生产单未找到 SKU。"
          : matched.length > 1
            ? "SKU 对应多行，请逐行填写。"
            : !valid.ok
              ? valid.message
              : "",
    };
  });
  return rows.map((row) => ({
    ...row,
    error:
      row.error ||
      (rows.filter((r) => r.sku === row.sku).length > 1
        ? "粘贴内容有重复 SKU。"
        : row.barcode &&
            (rows.some((r) => r !== row && r.barcode === row.barcode) ||
              items.some(
                (i) =>
                  i.id !== row.id &&
                  i.barcode_number === row.barcode &&
                  !rows.some((r) => r.id === i.id),
              ))
          ? "条形码重复，请核对后逐行填写。"
          : ""),
  }));
}

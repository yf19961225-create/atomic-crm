/** Immutable customer request copied when this Quote was created. */
export function RequestedQuantity({
  websiteSource,
  value,
}: {
  websiteSource: boolean;
  value: unknown;
}) {
  if (!websiteSource) return null;
  const quantity = value == null || value === "" ? null : Number(value);
  return (
    <p
      className="text-muted-foreground text-xs"
      title="创建报价单时保存的原始询价数量，仅供参考，不随当前报价数量变化。"
    >
      询价数量：
      {quantity !== null && Number.isFinite(quantity) && quantity > 0
        ? quantity
        : "—"}
    </p>
  );
}

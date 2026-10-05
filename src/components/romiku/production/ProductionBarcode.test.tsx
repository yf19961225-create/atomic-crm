import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { ProductionBarcode, BarcodePaste } from "./ProductionBarcode";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
function Editor() {
  const [barcode, setBarcode] = useState<string | null>(null);
  return (
    <>
      <ProductionBarcode
        line={{
          id: "1",
          sku: "SUN5",
          source_order_item_id: "s1",
          barcode_number: barcode,
        }}
        onChange={setBarcode}
      />
      <output aria-label="draft">{barcode || "blank"}</output>
    </>
  );
}
it("does not generate on mount, previews sibling reuse and only fills after explicit confirmation", async () => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: { ok: true, kind: "reuse", candidates: ["0123456789012"] },
    error: null,
  });
  const screen = await render(<Editor />);
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "自动生成 / 沿用" }).click();
  await expect
    .element(screen.getByRole("region", { name: "条形码预览 SUN5" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("status", { name: "draft" }))
    .toHaveTextContent("blank");
  await screen.getByRole("button", { name: "取消条码预览" }).click();
  await expect
    .element(screen.getByRole("status", { name: "draft" }))
    .toHaveTextContent("blank");
  await screen.getByRole("button", { name: "自动生成 / 沿用" }).click();
  await screen.getByRole("button", { name: "确认使用 0123456789012" }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "条形码 SUN5" }))
    .toHaveValue("0123456789012");
  expect(rpc).toHaveBeenLastCalledWith("romiku_production_barcode", {
    source_item_id: "s1",
    generate_number: true,
    production_item_id: "1",
  });
});
it("invalid customer input is retained until the suggested check digit is confirmed; clear stays blank", async () => {
  const screen = await render(<Editor />);
  await screen
    .getByRole("textbox", { name: "条形码 SUN5" })
    .fill("1234567890129");
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("校验位不正确");
  await expect
    .element(screen.getByRole("textbox", { name: "条形码 SUN5" }))
    .toHaveValue("1234567890129");
  await screen.getByRole("button", { name: "确认使用 1234567890128" }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "条形码 SUN5" }))
    .toHaveValue("1234567890128");
  await screen.getByRole("button", { name: "不使用", exact: true }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "条形码 SUN5" }))
    .toHaveValue("");
});
it("batch paste never applies before mapping confirmation and blocks unknown SKU", async () => {
  const apply = vi.fn();
  const screen = await render(
    <BarcodePaste items={[{ id: "1", sku: "SUN5" }]} onApply={apply} />,
  );
  await screen.getByText("批量填写条形码", { exact: true }).click();
  await screen
    .getByRole("textbox", { name: "批量条形码" })
    .fill("UNKNOWN\t0123456789012");
  await screen.getByRole("button", { name: "预览条形码映射" }).click();
  await expect
    .element(screen.getByRole("button", { name: "确认应用条形码到草稿" }))
    .toBeDisabled();
  expect(apply).not.toHaveBeenCalled();
  await screen
    .getByRole("textbox", { name: "批量条形码" })
    .fill("SUN5\t0123456789012");
  await screen.getByRole("button", { name: "预览条形码映射" }).click();
  expect(apply).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "确认应用条形码到草稿" }).click();
  expect(apply).toHaveBeenCalledWith([{ id: "1", barcode: "0123456789012" }]);
});

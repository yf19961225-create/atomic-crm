import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { BulkSupplierDialog } from "./BulkSupplierDialog";
import type { ProductSupplierManagementClient } from "./productSupplierManagementClient";

const products = [
  { id: "sanity-a", sku: "SKU-A", skuSort: "SKU-A", isPublished: true },
  { id: "sanity-b", sku: "SKU-B", skuSort: "SKU-B", isPublished: true },
];
const management = (): ProductSupplierManagementClient => ({
  save: vi.fn().mockResolvedValue({ ok: true }),
  replace: vi.fn().mockResolvedValue({ ok: true }),
  remove: vi.fn().mockResolvedValue({ ok: true }),
  previewBulk: vi.fn().mockResolvedValue({ ok: true, planToken: "token", selectedProductCount: 2, supplierCount: 2, newCount: 3, reactivateCount: 0, skipCount: 1, invalidSkus: [] }),
  applyBulk: vi.fn().mockResolvedValue({ ok: true }),
});

describe("BulkSupplierDialog", () => {
  it("previews multiple suppliers and requires a separate confirmation to apply", async () => {
    const client = management();
    const onApplied = vi.fn().mockResolvedValue(undefined);
    const screen = await render(<BulkSupplierDialog products={products} suppliers={[{ id: "supplier-a", name: "甲" }, { id: "supplier-b", name: "乙" }]} client={client} onApplied={onApplied} onClose={vi.fn()} />);
    await screen.getByLabelText("甲").click();
    await screen.getByLabelText("乙").click();
    await screen.getByLabelText("指定首选供应商").selectOptions("supplier-b");
    await screen.getByRole("button", { name: "预览批量设置" }).click();
    expect(client.previewBulk).toHaveBeenCalledWith([
      { sku: "SKU-A", sanity_product_id: "sanity-a" },
      { sku: "SKU-B", sanity_product_id: "sanity-b" },
    ], ["supplier-a", "supplier-b"], "supplier-b");
    expect(client.applyBulk).not.toHaveBeenCalled();
    await expect.element(screen.getByText(/将新增 3 条/)).toBeVisible();
    await screen.getByRole("button", { name: "确认批量设置" }).click();
    expect(client.applyBulk).toHaveBeenCalledWith(expect.any(Array), ["supplier-a", "supplier-b"], "supplier-b", "token");
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("never applies a stale preview after selection changes", async () => {
    const client = management();
    const screen = await render(<BulkSupplierDialog products={products} suppliers={[{ id: "supplier-a", name: "甲" }, { id: "supplier-b", name: "乙" }]} client={client} onApplied={vi.fn()} onClose={vi.fn()} />);
    await screen.getByLabelText("甲").click();
    await screen.getByRole("button", { name: "预览批量设置" }).click();
    await screen.getByLabelText("乙").click();
    expect(screen.getByRole("button", { name: "确认批量设置" })).not.toBeInTheDocument();
    expect(client.applyBulk).not.toHaveBeenCalled();
  });
});

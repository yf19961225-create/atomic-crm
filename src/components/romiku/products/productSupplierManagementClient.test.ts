import { describe, expect, it, vi } from "vitest";
import { createProductSupplierManagementClient } from "./productSupplierManagementClient";

describe("product supplier controlled RPC client", () => {
  it("edits procurement fields by relation ID without sending supplier identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const client = createProductSupplierManagementClient(rpc);
    await client.save({
      relationId: "relation-1",
      supplierItemNumber: "MODEL-1",
      moq: 24,
      leadDays: 7,
      preferred: false,
    });
    expect(rpc).toHaveBeenCalledWith(
      "romiku_save_product_supplier",
      expect.objectContaining({ relation_id: "relation-1", supplier_item_number: "MODEL-1" }),
    );
    const payload = rpc.mock.calls[0][1];
    expect(payload).not.toHaveProperty("supplier_id");
    expect(payload).not.toHaveProperty("sku");
  });

  it("uses distinct replace and delete RPCs and exposes safe server codes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, code: "ALREADY_LINKED" }, error: null });
    const client = createProductSupplierManagementClient(rpc);
    await expect(client.replace("relation-1", "supplier-2", false)).rejects.toMatchObject({ code: "ALREADY_LINKED" });
    expect(rpc).toHaveBeenCalledWith("romiku_replace_product_supplier", {
      source_relation_id: "relation-1", target_supplier_id: "supplier-2", make_preferred: false,
    });
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await client.remove("relation-1");
    expect(rpc).toHaveBeenCalledWith("romiku_delete_product_supplier", { relation_id: "relation-1" });
  });

  it("requires a server plan token before bulk apply", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, planToken: "plan-1" }, error: null });
    const client = createProductSupplierManagementClient(rpc);
    const products = [{ sku: "SKU-1", sanity_product_id: "sanity-1" }];
    await client.previewBulk(products, ["supplier-1"], null);
    await client.applyBulk(products, ["supplier-1"], null, "plan-1");
    expect(rpc).toHaveBeenLastCalledWith("romiku_apply_bulk_product_suppliers", {
      products, supplier_ids: ["supplier-1"], preferred_supplier_id: null, expected_plan_token: "plan-1",
    });
  });
});

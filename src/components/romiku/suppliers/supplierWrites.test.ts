import { describe, expect, it } from "vitest";
import { toSupplierContactWrite } from "./supplierWrites";

describe("supplier contact writes", () => {
  it("preserves the supplier relationship and normalizes optional contact fields", () => {
    expect(
      toSupplierContactWrite({ supplier_id: "supplier-a", name: "  Mei  " }),
    ).toEqual({
      supplier_id: "supplier-a",
      name: "Mei",
      title: null,
      department: null,
      role: null,
      email: null,
      phone: null,
      whatsapp: null,
      wechat: null,
      is_primary: false,
      is_active: true,
      notes: null,
    });
  });
});

import {
  ProductExtensionCreate,
  ProductExtensionEdit,
  ProductSupplierCreate,
  ProductSupplierEdit,
  ProcurementCostCreate,
} from "../products";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { createRoutesFromElements, matchRoutes } from "react-router";
import {
  SupplierContactCreate,
  SupplierContactEdit,
  SupplierEdit,
} from "../suppliers";
import { romikuRoutes } from "./RomikuRoutes";

describe("supplier edit route", () => {
  it("opens the supplier editor at the EditButton URL on direct navigation", () => {
    const matches = matchRoutes(
      createRoutesFromElements(<>{romikuRoutes}</>),
      "/romiku_suppliers/a3dfa56e-77c4-48ba-8436-2c57ea81ea0a",
    );

    const element = matches?.at(-1)?.route.element;
    expect(isValidElement(element) && element.type).toBe(SupplierEdit);
    expect(matches?.at(-1)?.params.id).toBe(
      "a3dfa56e-77c4-48ba-8436-2c57ea81ea0a",
    );
  });

  it("opens the supplier contact editor at the EditButton URL on direct navigation", () => {
    const matches = matchRoutes(
      createRoutesFromElements(<>{romikuRoutes}</>),
      "/romiku_supplier_contacts/contact-123",
    );

    const element = matches?.at(-1)?.route.element;
    expect(isValidElement(element) && element.type).toBe(SupplierContactEdit);
    expect(matches?.at(-1)?.params.id).toBe("contact-123");
  });
});

describe("existing product form entry points", () => {
  it.each([
    ["/romiku_product_extensions/create", ProductExtensionCreate],
    ["/romiku_product_extensions/product-123", ProductExtensionEdit],
    ["/romiku_product_suppliers/create", ProductSupplierCreate],
    ["/romiku_product_suppliers/link-123", ProductSupplierEdit],
    ["/romiku_procurement_cost_history/create", ProcurementCostCreate],
    ["/romiku_supplier_contacts/create", SupplierContactCreate],
  ])(
    "resolves %s to its form rather than a missing page or edit record",
    (path, form) => {
      const matches = matchRoutes(
        createRoutesFromElements(<>{romikuRoutes}</>),
        path,
      );
      const element = matches?.at(-1)?.route.element;
      expect(isValidElement(element) && element.type).toBe(form);
    },
  );
});

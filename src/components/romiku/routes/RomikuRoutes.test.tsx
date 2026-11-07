import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { createRoutesFromElements, matchRoutes } from "react-router";
import { SupplierContactEdit, SupplierEdit } from "../suppliers";
import {
  ProductExtensionCreate,
  ProductExtensionEdit,
  ProductSupplierCreate,
  ProductSupplierEdit,
  ProcurementCostCreate,
} from "../products";
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

describe("product auxiliary form routes", () => {
  it.each([
    ["/romiku_product_extensions/create", ProductExtensionCreate, undefined],
    [
      "/romiku_product_extensions/extension-123",
      ProductExtensionEdit,
      "extension-123",
    ],
    ["/romiku_product_suppliers/create", ProductSupplierCreate, undefined],
    [
      "/romiku_product_suppliers/relation-123",
      ProductSupplierEdit,
      "relation-123",
    ],
    [
      "/romiku_procurement_cost_history/create",
      ProcurementCostCreate,
      undefined,
    ],
  ])(
    "opens the existing form at %s with the correct record context",
    (path, component, id) => {
      const matches = matchRoutes(
        createRoutesFromElements(<>{romikuRoutes}</>),
        path as string,
      );
      const element = matches?.at(-1)?.route.element;
      expect(isValidElement(element) && element.type).toBe(component);
      expect(matches?.at(-1)?.params.id).toBe(id);
    },
  );
});

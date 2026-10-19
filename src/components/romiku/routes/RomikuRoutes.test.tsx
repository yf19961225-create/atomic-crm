import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { createRoutesFromElements, matchRoutes } from "react-router";
import { SupplierEdit } from "../suppliers";
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
});

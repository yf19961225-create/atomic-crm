import { expect, it } from "vitest";
import {
  defaultPackingSellerSnapshot,
  packingContactSnapshot,
  withPackingItemUnit,
} from "./packingExportSnapshot";

it("normalizes saved Packing contact data and keeps Unit in the item snapshot", () => {
  expect(defaultPackingSellerSnapshot()).toMatchObject({
    company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
    website: "www.romiku.com",
  });
  expect(
    packingContactSnapshot({
      company: "Saved buyer",
      shipping_address: "Saved address",
      whatsapp: "+34 1",
      website: "buyer.example",
      email: "buyer@example.test",
    }),
  ).toEqual({
    company_name: "Saved buyer",
    address: "Saved address",
    tel_whatsapp: "+34 1",
    website: "buyer.example",
    email: "buyer@example.test",
  });
  expect(withPackingItemUnit({ name: "Lamp", unit: "PCS" }, "SET")).toEqual({
    name: "Lamp",
    unit: "SET",
  });
});

import { describe, expect, it } from "vitest";
import { formalCustomerSnapshot } from "./formalCustomerSnapshot";

describe("formalCustomerSnapshot", () => {
  it("copies current customer directory data into a document-only snapshot", () => {
    expect(
      formalCustomerSnapshot({
        id: "customer-1",
        name: "Salon Norte",
        brand: "Norte Pro",
        country: "Spain",
        city: "Madrid",
        contact: "Ana Buyer",
        whatsapp: "+34123",
        email: "ana@example.test",
        logistics: {
          receiving_company: "Salon Norte SL",
          receiving_contact: "Ana Buyer",
          delivery_address: "Madrid delivery",
          forwarder_address: "Shenzhen warehouse",
          tax_information: "RUC-123",
        },
      }),
    ).toEqual({
      name: "Salon Norte",
      brand: "Norte Pro",
      country: "Spain",
      city: "Madrid",
      contact: "Ana Buyer",
      whatsapp: "+34123",
      email: "ana@example.test",
      consignee: "Salon Norte SL",
      consignee_contact: "Ana Buyer",
      shipping_address: "Madrid delivery",
      forwarder_address: "Shenzhen warehouse",
      tax_information: "RUC-123",
    });
  });

  it("omits absent profile fields instead of manufacturing a customer record", () => {
    expect(
      formalCustomerSnapshot({ id: "customer-2", name: "Walk-in" }),
    ).toEqual({
      name: "Walk-in",
    });
  });
});

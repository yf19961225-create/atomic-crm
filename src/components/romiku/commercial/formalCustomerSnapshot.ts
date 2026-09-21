import type { RaRecord } from "ra-core";

type CustomerDirectoryRecord = RaRecord & {
  logistics?: Record<string, unknown>;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Copies a Formal Customer's current profile into an independent document snapshot. */
export function formalCustomerSnapshot(customer: CustomerDirectoryRecord) {
  const logistics = customer.logistics || {};
  return Object.fromEntries(
    [
      ["name", customer.name],
      ["brand", customer.brand],
      ["country", customer.country],
      ["city", customer.city],
      ["contact", customer.contact],
      ["whatsapp", customer.whatsapp],
      ["email", customer.email],
      ["phone", customer.phone],
      ["consignee", logistics.receiving_company],
      ["consignee_contact", logistics.receiving_contact],
      ["shipping_address", logistics.delivery_address],
      ["forwarder_address", logistics.forwarder_address],
      ["tax_information", logistics.tax_information],
    ].flatMap(([key, value]) => {
      const next = text(value);
      return next ? [[key, next]] : [];
    }),
  );
}

import { expect, it } from "vitest";
import {
  defaultQuoteExportSnapshot,
  quoteExportSnapshot,
} from "./quoteExportSnapshot";

it("keeps the Quote seller snapshot independent from later defaults", () => {
  expect(defaultQuoteExportSnapshot()).toMatchObject({
    template_key: "quote",
    seller: {
      company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
    },
  });
  expect(
    quoteExportSnapshot({
      quote_export: { seller: { company_name: "Saved Quote Seller" } },
    }).seller.company_name,
  ).toBe("Saved Quote Seller");
});

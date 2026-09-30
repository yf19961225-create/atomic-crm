import { expect, it } from "vitest";
import {
  defaultPiBankSnapshot,
  defaultPiExportSnapshot,
  withPiExportSnapshot,
} from "./piExportSnapshot";

it("creates independent PI export and banking snapshots with visible blocks", () => {
  const first = defaultPiExportSnapshot();
  const second = defaultPiExportSnapshot();
  first.seller.company_name = "Current PI only";
  expect(second.seller.company_name).toContain("ROMIKU");
  expect(first.template_key).toBe("pi");
  expect(first.terms_visible).toBe(true);
  expect(Object.keys(first.terms)).toHaveLength(8);

  expect(defaultPiBankSnapshot()).toMatchObject({
    beneficiary_name: "YIWU ROMIKU NAIL ART CO., LTD. 义乌络洣库美甲有限公司",
    bank_information_visible: true,
    bank_name: "",
    swift_code: "",
  });
  expect(withPiExportSnapshot({ legacy: true }, second)).toMatchObject({
    legacy: true,
    pi_export: { template_key: "pi" },
  });
});

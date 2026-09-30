import {
  defaultOrderExportSnapshot,
  type ContactSnapshot,
} from "./orderExportSnapshot";

export type PiBankSnapshot = {
  beneficiary_name: string;
  beneficiary_address: string;
  bank_name: string;
  bank_address: string;
  account_no: string;
  swift_code: string;
  bank_information_visible: boolean;
};
export type PiExportSnapshot = {
  template_key: "pi";
  terms_visible: boolean;
  seller: ContactSnapshot;
  terms: ReturnType<typeof defaultOrderExportSnapshot>["terms"];
};

export const defaultPiBankSnapshot = (): PiBankSnapshot => ({
  beneficiary_name: "YIWU ROMIKU NAIL ART CO., LTD. 义乌络洣库美甲有限公司",
  beneficiary_address:
    "72790, 3rd Street, Unit 4, 2nd Floor, Gate 153,Global Digital Trade Center Yiwu",
  bank_name: "",
  bank_address: "",
  account_no: "",
  swift_code: "",
  bank_information_visible: true,
});
export const defaultPiExportSnapshot = (): PiExportSnapshot => {
  const order = defaultOrderExportSnapshot();
  return {
    template_key: "pi",
    terms_visible: true,
    seller: { ...order.seller },
    terms: structuredClone(order.terms),
  };
};
export function withPiExportSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  piExport: PiExportSnapshot = defaultPiExportSnapshot(),
) {
  return { ...(snapshot || {}), pi_export: piExport };
}

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
    seller: {
      ...order.seller,
      address:
        "72790, 3rd Street, Unit 4, 2nd Floor, Gate 153,Global Digital Trade Center Yiwu,China\n义乌市国际商贸城六区152号门2楼4单元3街72790",
    },
    terms: structuredClone(order.terms),
  };
};
export function piExportSnapshot(value: unknown): PiExportSnapshot {
  const defaults = defaultPiExportSnapshot();
  const saved = (value as { pi_export?: Partial<PiExportSnapshot> } | null)
    ?.pi_export;
  if (!saved) return defaults;
  return {
    template_key: "pi",
    terms_visible: saved.terms_visible !== false,
    seller: { ...defaults.seller, ...saved.seller },
    terms: Object.fromEntries(
      Object.entries(defaults.terms).map(([key, term]) => [
        key,
        {
          ...term,
          ...(saved.terms?.[key as keyof typeof defaults.terms] || {}),
        },
      ]),
    ) as PiExportSnapshot["terms"],
  };
}
export function withPiExportSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  piExport: PiExportSnapshot = defaultPiExportSnapshot(),
) {
  return { ...(snapshot || {}), pi_export: piExport };
}

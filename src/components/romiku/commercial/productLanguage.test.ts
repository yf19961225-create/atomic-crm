import { expect, it } from "vitest";
import { createItemSnapshot } from "./ProductLibraryLookup";
import { translateSnapshot, productText } from "./productLanguage";
const product = {
  id: "sample",
  sku: "SAMPLE",
  skuSort: "SAMPLE",
  isPublished: true,
  name: {
    zh: "美甲灯",
    en: "Nail Lamp",
    es: "Lámpara de uñas",
    ptBR: "Cabine para unhas",
  },
  parameters: [
    {
      label: { en: "Specifications" },
      value: {
        zh: "120W 24LEDS",
        en: "120W 24LEDS",
        es: "120W 24LEDS",
        ptBR: "120W 24LEDS",
      },
    },
  ],
  powerSupply: { zh: "插电", en: "Corded", es: "Con cable", ptBR: "Com fio" },
  cartonQty: 30,
};
it.each(["zh", "en", "es", "pt-BR"] as const)(
  "captures exact %s text and technical values",
  (language) => {
    const snapshot = createItemSnapshot(
      product,
      "https://example.com/same-sku.png",
      { documentLanguage: language },
    );
    const expected = productText(product, language);
    expect(snapshot.product_snapshot.name).toBe(expected.name);
    expect(snapshot.product_snapshot.specification).toContain("120W 24LEDS");
    expect(snapshot.packing_snapshot.qty_per_carton).toBe(30);
    expect(snapshot.product_snapshot).toMatchObject({
      language,
      localized_text: expect.any(Object),
    });
  },
);
it("does not silently fall back to Chinese or English for a missing target translation", () => {
  const snapshot = createItemSnapshot(
    {
      ...product,
      name: { zh: "美甲灯" },
      parameters: [{ label: { zh: "参数" }, value: { zh: "120W 插电" } }],
      powerSupply: undefined,
    },
    undefined,
    { documentLanguage: "es" },
  );
  expect(snapshot.product_snapshot.name).toBe("");
  expect(snapshot.product_snapshot.specification).toBe("");
  expect(snapshot.product_snapshot.translation_pending).toEqual([
    "name",
    "specification",
  ]);
});
it("language conversion preserves manually changed fields and all non-text data", () => {
  const original = createItemSnapshot(product, "image", {
    documentLanguage: "zh",
  }).product_snapshot;
  const changed = { ...original, specification: "人工规格", custom: 42 };
  const translated = translateSnapshot(changed, "es");
  expect(translated.name).toBe("Lámpara de uñas");
  expect(translated.specification).toBe("人工规格");
  expect(translated.image_url).toBe("image");
  expect(translated.custom).toBe(42);
});
it("leaves historical text without provenance untouched", () => {
  expect(
    translateSnapshot({ name: "历史名称", specification: "旧规格" }, "en"),
  ).toEqual({ name: "历史名称", specification: "旧规格" });
});

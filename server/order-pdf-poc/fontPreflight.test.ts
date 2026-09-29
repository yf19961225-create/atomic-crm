import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { preflightTemplateFonts } from "../../services/order-pdf-poc/src/fontPreflight.mjs";

const templatePath = new URL(
  "../../src/assets/order-templates/ROMIKU_订单_模板.xlsx",
  import.meta.url,
);

describe("preflightTemplateFonts", () => {
  it("requires approved legal worker fonts for every font actually used by the Order template", async () => {
    const xlsx = await readFile(templatePath);

    const result = await preflightTemplateFonts(xlsx, {
      "Liberation Sans":
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
      "Noto Serif CJK SC":
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    });

    expect(result.ok).toBe(true);
    expect(result.requiredFamilies).toEqual(
      expect.arrayContaining(["Arial", "Songti SC Regular", "宋体"]),
    );
    expect(result.resolvedFamilies).toEqual(
      expect.objectContaining({
        Arial: "Liberation Sans",
        "Songti SC Regular": "Noto Serif CJK SC",
        宋体: "Noto Serif CJK SC",
      }),
    );
  });

  it("fails closed when a template font has no approved legal mapping", async () => {
    const xlsx = await readFile(templatePath);

    const result = await preflightTemplateFonts(xlsx, {
      "Liberation Sans": "/fonts/LiberationSans-Regular.ttf",
    });

    expect(result.ok).toBe(false);
    expect(result.unresolvedFamilies).toEqual(
      expect.arrayContaining(["Songti SC Regular", "宋体"]),
    );
  });
});

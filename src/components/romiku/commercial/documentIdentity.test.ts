import { expect, it } from "vitest";
import { documentTitle } from "./documentIdentity";
it("names including T and multilingual characters stay intact, blanks fall back", () => {
  expect(
    documentTitle({
      document_name: "October Tú 美甲灯",
      document_number: "OD001",
    }),
  ).toBe("October Tú 美甲灯");
  for (const document_name of [null, undefined, "", "   "])
    expect(
      documentTitle({ document_name, document_number: "OLD-CUSTOM-NUMBER" }),
    ).toBe("OLD-CUSTOM-NUMBER");
});

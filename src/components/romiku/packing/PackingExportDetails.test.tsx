import { expect, it } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { PackingExportDetails } from "./PackingExportDetails";

it("edits only the current Packing Seller and Buyer snapshots", async () => {
  let next: Record<string, unknown> | undefined;
  function Fixture() {
    const [values, setValues] = useState<Record<string, unknown>>({
      seller_snapshot: { company_name: "Original Seller" },
      buyer_snapshot: { company_name: "Original Buyer" },
    });
    return (
      <PackingExportDetails
        values={values}
        editable
        onChange={(value) => {
          next = value;
          setValues(value);
        }}
      />
    );
  }
  const screen = await render(<Fixture />);
  await screen
    .getByRole("button", { name: "导出信息 / Document Details" })
    .click();
  await screen.getByLabelText("Seller company_name").fill("Packing Seller");
  await screen.getByLabelText("Buyer company_name").fill("Packing Buyer");
  expect(next).toMatchObject({
    seller_snapshot: { company_name: "Packing Seller" },
    buyer_snapshot: { company_name: "Packing Buyer" },
  });
});

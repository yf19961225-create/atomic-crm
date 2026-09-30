import { expect, it, vi } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { PiExportDetails } from "./PiExportDetails";
import { piExportSnapshot } from "./piExportSnapshot";

it("stages PI-only Seller, Buyer, Terms and Banking snapshot edits", async () => {
  const onChange = vi.fn();
  const Harness = () => {
    const [values, setValues] = useState<Record<string, unknown>>({
      counterparty_snapshot: { name: "Original buyer" },
    });
    return (
      <PiExportDetails
        values={values}
        editable
        onChange={(next) => {
          setValues(next);
          onChange(next);
        }}
      />
    );
  };
  const screen = await render(<Harness />);

  await screen.getByRole("button", { name: /导出信息/ }).click();
  await expect
    .element(screen.getByLabelText("显示条款与条件", { exact: true }))
    .toBeChecked();
  await expect
    .element(screen.getByLabelText("显示银行信息", { exact: true }))
    .toBeChecked();
  await screen
    .getByLabelText("Seller company_name", { exact: true })
    .fill("PI seller");
  await screen
    .getByLabelText("Buyer Company / Name", { exact: true })
    .fill("PI buyer");
  await screen
    .getByLabelText("Bank bank_name", { exact: true })
    .fill("PI bank");
  await screen.getByLabelText("显示银行信息", { exact: true }).click();

  const next = onChange.mock.lastCall?.[0] as Record<string, unknown>;
  expect(piExportSnapshot(next.terms_snapshot).seller.company_name).toBe(
    "PI seller",
  );
  expect(next.counterparty_snapshot).toMatchObject({ name: "PI buyer" });
  expect(next.bank_snapshot).toMatchObject({
    bank_name: "PI bank",
    bank_information_visible: false,
  });
});

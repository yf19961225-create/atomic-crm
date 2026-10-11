import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { OrderPayments } from "./OrderPayments";
import { hasAppDraft } from "../updates/drafts";

it("keeps payment defaults clean and clears numeric/text reverts, cancel and save", async () => {
  const provider = fakeRestDataProvider({
    romiku_payments: [
      {
        id: "p",
        order_id: "o",
        status: "received",
        kind: "deposit",
        amount: 10,
        received_at: "2026-10-01T00:00:00Z",
        notes: null,
      },
    ],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <OrderPayments order={{ id: "o", currency: "USD" }} total={100} />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "添加收款", exact: true }).click();
  expect(hasAppDraft()).toBe(false);
  await screen.getByRole("textbox", { name: /^收款备注/ }).fill("Draft");
  expect(hasAppDraft()).toBe(true);
  await screen.getByRole("textbox", { name: /^收款备注/ }).fill("");
  expect(hasAppDraft()).toBe(false);
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(hasAppDraft()).toBe(false);
  await screen.getByRole("button", { name: "编辑收款", exact: true }).click();
  expect(hasAppDraft()).toBe(false);
  await screen.getByLabelText("收款金额", { exact: true }).fill("11");
  expect(hasAppDraft()).toBe(true);
  await screen.getByLabelText("收款金额", { exact: true }).fill("10.00");
  expect(hasAppDraft()).toBe(false);
  await screen.getByRole("textbox", { name: /^收款备注/ }).fill("Changed");
  await screen.getByRole("button", { name: "保存收款", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "添加收款", exact: true }))
    .toBeVisible();
  expect(hasAppDraft()).toBe(false);
});

import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  DocumentRollbackBoundary,
  assertDocumentWritesEnabled,
} from "./documentRollback";

it("rollback keeps document content readable but disables editing controls", async () => {
  const save = vi.fn();
  const screen = await render(
    <DocumentRollbackBoundary enabled pathname="/orders/qa">
      <h1>QA order</h1>
      <input aria-label="quantity" defaultValue="3" />
      <button onClick={save}>保存</button>
      <a href="/#/orders/other">另一订单</a>
    </DocumentRollbackBoundary>,
  );
  await expect
    .element(screen.getByRole("heading", { name: "QA order" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "保存" }))
    .toBeDisabled();
  await expect.element(screen.getByLabelText("quantity")).toBeDisabled();
  await expect
    .element(screen.getByRole("link", { name: "另一订单" }))
    .toBeVisible();
  expect(save).not.toHaveBeenCalled();
});
it("normal build and unrelated read pages remain usable", async () => {
  const screen = await render(
    <DocumentRollbackBoundary enabled={false} pathname="/orders/create">
      <button>保存</button>
    </DocumentRollbackBoundary>,
  );
  await expect
    .element(screen.getByRole("button", { name: "保存" }))
    .toBeEnabled();
});
it("rollback rejects new saves and source conversions before network calls", () => {
  expect(() => assertDocumentWritesEnabled(true)).toThrow("只读回退");
  expect(() => assertDocumentWritesEnabled(false)).not.toThrow();
});

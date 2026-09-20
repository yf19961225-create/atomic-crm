import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DocumentHeaderSummary } from "./DocumentHeaderSummary";

it("shows the saved customer snapshot and edits only the document values", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DocumentHeaderSummary
      kind="order"
      editable={false}
      values={{
        document_number: "SO-001",
        document_date: "2026-09-20",
        currency: "USD",
        due_at: "2026-10-20",
        expected_delivery_at: "2026-10-30T00:00:00.000Z",
        counterparty_snapshot: {
          name: "Ana",
          brand: "Salon A",
          country: "Spain",
          contact: "Ana Buyer",
          whatsapp: "+34123",
          email: "ana@example.test",
          shipping_address: "Madrid",
        },
      }}
      onChange={onChange}
    />,
  );
  await expect.element(screen.getByText("Salon A")).toBeVisible();
  await expect.element(screen.getByText("Madrid")).toBeVisible();
  await screen.rerender(
    <DocumentHeaderSummary
      kind="order"
      editable
      values={{ counterparty_snapshot: { name: "Ana" } }}
      onChange={onChange}
    />,
  );
  await screen
    .getByLabelText("客户名称", { exact: true })
    .fill("Document-only name");
  expect(onChange).toHaveBeenLastCalledWith({
    counterparty_snapshot: { name: "Document-only name" },
  });
});

it("copies an existing Formal Customer into only the current document snapshot", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DocumentHeaderSummary
      kind="quote"
      editable
      values={{ counterparty_snapshot: { name: "Manual buyer" } }}
      customers={[
        {
          id: "customer-1",
          name: "Formal customer",
          country: "Spain",
          email: "formal@example.test",
        },
      ]}
      onChange={onChange}
    />,
  );
  await screen
    .getByLabelText("选择正式客户", { exact: true })
    .selectOptions("customer-1");
  expect(onChange).toHaveBeenLastCalledWith({
    counterparty_snapshot: {
      name: "Formal customer",
      country: "Spain",
      email: "formal@example.test",
    },
  });
});

it("stores the document language as a stable locale value independent of currency", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DocumentHeaderSummary
      kind="quote"
      editable
      values={{ document_language: "zh", currency: "USD" }}
      onChange={onChange}
    />,
  );
  await screen
    .getByLabelText("表格类型 / 单据语言", { exact: true })
    .selectOptions("es");
  expect(onChange).toHaveBeenLastCalledWith({
    document_language: "es",
    currency: "USD",
  });
});

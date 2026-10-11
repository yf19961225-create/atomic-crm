import { expect, it, vi } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QuoteCreate } from "../quotes/QuoteCreate";
import { DocumentCreate } from "../orders/DocumentPages";
import { CommercialItemDrawer } from "../commercial/CommercialItemDrawer";
import { QuoteItems } from "../quotes/QuoteItems";
import { useDocumentEditSession } from "../commercial/useDocumentEditSession";
import { useAppDraft, useHasAppDraft } from "./drafts";
function Probe() {
  return <output aria-label="draft state">{String(useHasAppDraft())}</output>;
}
const provider = () =>
  fakeRestDataProvider({ sales: [], romiku_formal_customer_directory: [] });
it("Quote create defaults are clean, user name is dirty and exact revert is clean", async () => {
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider()}>
        <QuoteCreate />
        <Probe />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "采购方名称" }).fill("QA unsaved");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("textbox", { name: "采购方名称" }).fill("");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});
it.each(["pi", "order"] as const)(
  "%s create does not register until user input",
  async (kind) => {
    const screen = await render(
      <MemoryRouter>
        <CoreAdminContext dataProvider={provider()}>
          <DocumentCreate kind={kind} />
          <Probe />
        </CoreAdminContext>
      </MemoryRouter>,
    );
    await expect
      .element(screen.getByLabelText("draft state"))
      .toHaveTextContent("false");
    await screen.getByRole("textbox", { name: "采购方名称" }).fill("QA");
    await expect
      .element(screen.getByLabelText("draft state"))
      .toHaveTextContent("true");
  },
);
it("product drawer open is clean, edits are protected and close unregisters only that editor", async () => {
  function Fixture() {
    const [other, setOther] = useState(false),
      [open, setOpen] = useState(true);
    useAppDraft(other);
    return (
      <>
        <Probe />
        <button onClick={() => setOther(true)}>Other edit</button>
        <button onClick={() => setOther(false)}>Other saved</button>
        <CommercialItemDrawer
          item={
            open
              ? {
                  id: "i",
                  sku: "SUN5",
                  quantity: 1,
                  unit_price: 0,
                  product_snapshot: { name: "Lamp", specification: "48W" },
                }
              : null
          }
          onClose={() => setOpen(false)}
          onSave={vi.fn()}
        />
      </>
    );
  }
  const screen = await render(<Fixture />);
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "规格", exact: true }).fill("60W");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("textbox", { name: "规格", exact: true }).fill("48W");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "规格", exact: true }).fill("60W");
  await screen.getByRole("button", { name: "Other edit" }).click();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("button", { name: "Other saved" }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});

it("new legacy Quote item starts clean and numeric revert clears its draft", async () => {
  const screen = await render(
    <CoreAdminContext dataProvider={provider()}>
      <QuoteItems quoteId="q" items={[]} onChanged={async () => {}} />
      <Probe />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "添加产品项", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "数量", exact: true }).fill("2");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("textbox", { name: "数量", exact: true }).fill("1.0");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});
it("commercial edit compares saved editable fields, normalizes numbers and preserves line order", async () => {
  const record = { id: "q", freight: 0, updated_at: "old", notes: null };
  const items = [{ id: "i", sku: "SUN5", quantity: 1, unit_price: 0 }];
  function Fixture() {
    const session = useDocumentEditSession(record, items, {
      readyForEdit: true,
    });
    useAppDraft(session.dirty);
    return (
      <>
        <Probe />
        <button onClick={session.start}>Edit</button>
        <button
          onClick={() =>
            session.setValues((v) => ({
              ...v,
              notes: "",
              freight: "0",
              updated_at: "new",
            }))
          }
        >
          Normalize
        </button>
        <button
          onClick={() =>
            session.setItems((v) => v.map((i) => ({ ...i, quantity: 2 })))
          }
        >
          Change quantity
        </button>
        <button
          onClick={() =>
            session.setItems((v) =>
              v.map((i) => ({ ...i, sanity_product_id: "library-product" })),
            )
          }
        >
          Link product
        </button>
        <button onClick={session.cancel}>Cancel</button>
      </>
    );
  }
  const screen = await render(<Fixture />);
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await screen.getByRole("button", { name: "Normalize", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen
    .getByRole("button", { name: "Change quantity", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await screen
    .getByRole("button", { name: "Link product", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
});

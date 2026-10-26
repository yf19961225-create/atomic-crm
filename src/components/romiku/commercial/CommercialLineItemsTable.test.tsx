import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { CommercialLineItemsTable } from "./CommercialLineItemsTable";
import type {
  CommercialDocumentKind,
  CommercialItem,
} from "./commercialLineItems";

const item = (id: number): CommercialItem => ({
  id: `row-${id}`,
  sku: `SKU-${id}`,
  position: id,
  quantity: 1,
  unit_price: 5.5,
  unit_price_entered: true,
  product_snapshot: {},
  packing_snapshot: {},
});
afterEach(() => vi.restoreAllMocks());
async function setup(kind: CommercialDocumentKind, count = 1) {
  const changes: CommercialItem[][] = [];
  function Fixture() {
    const [items, setItems] = useState(
      Array.from({ length: count }, (_, i) => item(i + 1)),
    );
    return (
      <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
        <CommercialLineItemsTable
          kind={kind}
          documentId="qa"
          items={items}
          currency="USD"
          onChanged={async () => {}}
          onItemsChange={(next) => {
            changes.push(next);
            setItems(next);
          }}
        />
      </CoreAdminContext>
    );
  }
  return { screen: await render(<Fixture />), changes };
}
const inputs = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[aria-label="搜索 SKU 或产品"]',
    ),
  );
const enter = (element: Element, init: KeyboardEventInit = {}) =>
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );

it.each(["quote", "pi", "order"] as const)(
  "%s final field Enter creates/focuses the next blank without persisting it",
  async (kind) => {
    const { screen, changes } = await setup(kind);
    const last = screen.getByLabelText(kind === "quote" ? "CBM" : "单价", {
      exact: true,
    });
    await last.click();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement === inputs()[1]).toBe(true);
    expect(inputs()).toHaveLength(2);
    expect(changes.flat().every((row) => Boolean(row.sku))).toBe(true);
  },
);

it.each([5, 10, 20])(
  "supports %i sequential entries with one next blank and stable saved prices",
  async (count) => {
    const { screen, changes } = await setup("order");
    for (let n = 1; n <= count; n++) {
      const price = screen.getByLabelText("单价", { exact: true }).nth(n - 1);
      await price.click();
      await userEvent.keyboard("{Enter}");
      await expect
        .poll(() => document.activeElement === inputs()[n])
        .toBe(true);
      expect(inputs()).toHaveLength(n + 1);
      if (n < count) {
        await screen
          .getByLabelText("草稿 SKU 1", { exact: true })
          .fill(`MANUAL-${n + 1}`);
        await userEvent.keyboard("{Enter}");
        await expect
          .poll(
            () => document.querySelectorAll('input[aria-label="单价"]').length,
          )
          .toBe(n + 1);
      }
    }
    expect(changes.at(-1)?.[0].unit_price).toBe(5.5);
    expect(changes.at(-1)?.every((row) => row.sku.trim())).toBe(true);
  },
);

it("focuses the next existing row instead of an earlier blank and ignores repeated/IME Enter", async () => {
  const { screen } = await setup("order", 2);
  await screen.getByRole("button", { name: "新增产品行", exact: true }).click();
  const prices = screen.getByLabelText("单价", { exact: true });
  await prices.nth(0).click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => document.activeElement === inputs()[1]).toBe(true);
  await prices.nth(1).click();
  const before = inputs().length;
  enter(prices.nth(1).element(), { repeat: true });
  enter(prices.nth(1).element(), { isComposing: true });
  expect(document.activeElement).toBe(prices.nth(1).element());
  expect(inputs()).toHaveLength(before);
});

// Selecting/committing the initial blank consumes it; this is the regression
// the old advanceRow (which only focused draftSkuRefs[0]) could not handle.
it.each(["quote", "pi", "order"] as const)(
  "%s appends exactly one blank after the last consumed draft",
  async (kind) => {
    const { screen } = await setup(kind);
    await screen.getByLabelText("搜索 SKU 或产品").nth(1).fill("MANUAL-LAST");
    await screen
      .getByLabelText(kind === "quote" ? "CBM" : "单价", { exact: true })
      .nth(0)
      .click();
    await expect
      .poll(() => document.querySelectorAll('input[aria-label="单价"]').length)
      .toBe(2);
    expect(inputs()).toHaveLength(2);
    await screen
      .getByLabelText(kind === "quote" ? "CBM" : "单价", { exact: true })
      .nth(1)
      .click();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => inputs().length).toBe(3);
    await expect.poll(() => document.activeElement === inputs()[2]).toBe(true);
    expect(
      document.querySelectorAll('input[aria-label="草稿 SKU 1"]'),
    ).toHaveLength(1);
  },
);

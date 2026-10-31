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
  expect(enter(prices.nth(1).element(), { repeat: true })).toBe(false);
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

it("recovers order snapshot images in editable and reopened read-only rows without saving any fields", async () => {
  const website = "https://romiku.com/images/products-local/st210_main.jpg";
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).startsWith("/api/product-catalog")
            ? { result: [] }
            : { images: { ST210: website } },
        ),
      ),
  );
  const saved = {
    ...item(1),
    sku: "ST210",
    product_snapshot: { image_url: "https://example.invalid/st210.png" },
  };
  const before = JSON.stringify(saved);
  const onItemsChange = vi.fn();
  const provider = fakeRestDataProvider({});
  const update = vi.spyOn(provider, "update");
  for (const editable of [true, false]) {
    const screen = await render(
      <CoreAdminContext dataProvider={provider}>
        <CommercialLineItemsTable
          kind="order"
          documentId="qa"
          items={[saved]}
          currency="USD"
          editable={editable}
          onChanged={async () => {}}
          onItemsChange={onItemsChange}
        />
      </CoreAdminContext>,
    );
    screen
      .getByRole("img", { name: "ST210 图片" })
      .element()
      .dispatchEvent(new Event("error"));
    await expect
      .element(screen.getByRole("img", { name: "ST210 图片" }))
      .toHaveAttribute("src", website);
    expect(JSON.stringify(saved)).toBe(before);
    expect(onItemsChange).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    await screen.unmount();
  }
});

it.each(["quote", "pi", "order"] as const)(
  "%s empty draft Enter does not create another blank",
  async (kind) => {
    const { screen } = await setup(kind, 0);
    const blank = screen.getByLabelText("草稿 SKU 1", { exact: true });
    const before = inputs().length;
    await blank.click();
    await userEvent.keyboard("{Enter}{Enter}{Enter}");
    expect(inputs()).toHaveLength(before);
  },
);

it("Quote CNY price Enter advances without submitting the form", async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const screen = await render(
    <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
      <form onSubmit={submit}>
        <CommercialLineItemsTable
          kind="quote"
          documentId="fx"
          items={[item(1)]}
          currency="USD"
          quoteFxEnabled
          quoteFxRate={7.2}
          onChanged={async () => {}}
          onItemsChange={() => {}}
        />
        <button type="submit">整单保存</button>
      </form>
    </CoreAdminContext>,
  );
  await screen.getByLabelText("人民币单价").click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => document.activeElement === inputs()[1]).toBe(true);
  expect(submit).not.toHaveBeenCalled();
});

// Every ordinary single-line cell must support the same next-row workflow.
it.each(["quote", "pi", "order"] as const)(
  "%s Enter from name, packing and quantity cells reuses the existing blank SKU",
  async (kind) => {
    await setup(kind);
    const row = inputs()[0].closest("tr")!;
    const fields = Array.from(
      row.querySelectorAll<HTMLInputElement>("input"),
    ).filter(
      (field) => !field.readOnly && !field.disabled && field !== inputs()[0],
    );
    expect(fields.length).toBeGreaterThan(2);
    for (const field of fields) {
      field.focus();
      await userEvent.keyboard("{Enter}");
      await expect
        .poll(() => document.activeElement === inputs()[1])
        .toBe(true);
      expect(inputs()).toHaveLength(2);
    }
  },
);

it("confirmed SKU Enter advances rather than reopening search", async () => {
  const { screen } = await setup("order");
  await screen.getByLabelText("搜索 SKU 或产品").nth(0).click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => document.activeElement === inputs()[1]).toBe(true);
  expect(inputs()).toHaveLength(2);
});

it.each(["quote", "pi", "order"] as const)(
  "%s keeps keyboard focus after selecting five successive catalog products",
  async (kind) => {
    let candidate = "TEST-1";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).startsWith("/api/product-catalog")
              ? {
                  result: [
                    {
                      _id: candidate,
                      sku: candidate,
                      isPublished: true,
                      name: { zh: `Product ${candidate}` },
                    },
                  ],
                }
              : { images: {}, powerSupplies: {} },
          ),
        ),
    );
    const { screen, changes } = await setup(kind, 0);
    await screen.getByLabelText("搜索 SKU 或产品").click();
    for (let n = 1; n <= 5; n++) {
      candidate = `TEST-${n}`;
      await userEvent.keyboard(candidate);
      await expect
        .element(
          screen.getByRole("button", {
            name: new RegExp(`${candidate} · Product ${candidate}`),
          }),
        )
        .toBeVisible();
      await userEvent.keyboard("{Enter}");
      await expect
        .poll(() => (document.activeElement as HTMLInputElement)?.value)
        .toBe(`Product ${candidate}`);
      // Product selection consumes Enter; a subsequent Enter advances the row.
      expect(inputs()).toHaveLength(n);
      await userEvent.keyboard("{Enter}");
      await expect
        .poll(() => document.activeElement === inputs()[n])
        .toBe(true);
      expect(inputs()).toHaveLength(n + 1);
      await userEvent.keyboard("{Enter}{Enter}");
      expect(inputs()).toHaveLength(n + 1);
    }
    expect(changes.at(-1)?.map((row) => row.sku)).toEqual([
      "TEST-1",
      "TEST-2",
      "TEST-3",
      "TEST-4",
      "TEST-5",
    ]);
  },
);

it("name IME/repeat and multiline specification Enter do not advance", async () => {
  await setup("order");
  const row = inputs()[0].closest("tr")!;
  const name = row.querySelector<HTMLInputElement>("input.w-28")!;
  name.focus();
  enter(name, { isComposing: true });
  enter(name, { keyCode: 229 });
  enter(name, { repeat: true });
  expect(document.activeElement).toBe(name);
  const specification = row.querySelector("textarea")!;
  specification.focus();
  await userEvent.keyboard("line one{Enter}line two");
  expect(specification.value).toBe("line one\nline two");
  expect(document.activeElement).toBe(specification);
  expect(inputs()).toHaveLength(2);
});

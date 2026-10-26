import { page } from "vitest/browser";
import "@/index.css";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { romikuRoutes } from "../routes/RomikuRoutes";
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));
it.each([
  ["quotes", "romiku_quotes", "romiku_quote_totals", "报价单"],
  ["pi", "romiku_pis", "romiku_pi_totals", "PI"],
  ["orders", "romiku_orders", "romiku_order_totals", "订单"],
])(
  "%s lists duplicate names by UUID and preserves blank-name fallback",
  async (path, resource, totals, label) => {
    await page.viewport(1440, 1000);
    const rows = [
      { id: "one", document_name: "同名 Tú", document_number: "FORMAL-1" },
      { id: "two", document_name: "同名 Tú", document_number: "FORMAL-2" },
      { id: "three", document_name: null, document_number: "LEGACY-3" },
    ].map((r) => ({
      ...r,
      status: "draft",
      created_at: "2026-10-26",
      counterparty_snapshot: { brand: "KEEP BRAND", name: "Buyer" },
      currency: "USD",
      total: 0,
      remaining_amount: 0,
    }));
    const provider = fakeRestDataProvider({
      [resource]: rows,
      [totals]: rows,
      sales: [],
      romiku_formal_customers: [],
    });
    const screen = await render(
      <MemoryRouter initialEntries={[`/${path}`]}>
        <CoreAdminContext dataProvider={provider}>
          <Routes>{romikuRoutes}</Routes>
        </CoreAdminContext>
      </MemoryRouter>,
    );
    expect(
      [...document.querySelectorAll("thead th")].map(
        (cell) => cell.textContent,
      ),
    ).toContain(label);
    await expect
      .poll(
        () =>
          screen.getByRole("link", { name: "同名 Tú", exact: true }).all()
            .length,
      )
      .toBe(2);
    const links = screen
      .getByRole("link", { name: "同名 Tú", exact: true })
      .all();
    const hrefs = await Promise.all(
      links.map(async (link) => link.element().getAttribute("href")),
    );
    expect(hrefs.sort()).toEqual([`/${path}/one`, `/${path}/two`]);
    await expect
      .element(screen.getByRole("link", { name: "LEGACY-3", exact: true }))
      .toBeVisible();
  },
);

import { beforeEach, vi } from "vitest";
import { render } from "vitest-browser-react";

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: mockUseIsMobile }));
import { MemoryRouter } from "react-router";

import { RomikuLayout } from "./RomikuLayout";

describe("RomikuLayout", () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
  });

  it("renders ROMIKU navigation instead of Atomic business modules", async () => {
    const screen = await render(
      <MemoryRouter>
        <RomikuLayout>
          <p>Workbench content</p>
        </RomikuLayout>
      </MemoryRouter>,
    );

    await expect
      .element(screen.getByRole("link", { name: "ROMIKU CRM 2.0" }))
      .toBeVisible();

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    await expect.element(navigation).toBeVisible();

    const expectedLinks = [
      ["Workbench", "/"],
      ["Website Inquiries", "/website-inquiries"],
      ["Outbound Development", "/outbound-development"],
      ["Formal Customers", "/formal-customers"],
      ["Quotes", "/quotes"],
      ["PI", "/pi"],
      ["Orders", "/orders"],
      ["Production", "/production"],
      ["Packing & Shipping", "/packing-shipping"],
      ["Calendar", "/calendar"],
      ["Suppliers", "/suppliers"],
      ["Product Library", "/product-library"],
      ["Settings", "/settings"],
    ];

    for (const [name, href] of expectedLinks) {
      await expect
        .element(navigation.getByRole("link", { name, exact: true }))
        .toHaveAttribute("href", href);
    }

    await expect
      .element(navigation.getByRole("link", { name: "Contacts" }))
      .not.toBeInTheDocument();
    await expect
      .element(navigation.getByRole("link", { name: "Companies" }))
      .not.toBeInTheDocument();
    await expect
      .element(navigation.getByRole("link", { name: "Deals" }))
      .not.toBeInTheDocument();
  });

  it("provides a primary navigation trigger on mobile", async () => {
    mockUseIsMobile.mockReturnValue(true);

    const screen = await render(
      <MemoryRouter>
        <RomikuLayout>
          <p>Workbench content</p>
        </RomikuLayout>
      </MemoryRouter>,
    );

    await expect
      .element(screen.getByRole("button", { name: "Open primary navigation" }))
      .toBeVisible();
  });
});

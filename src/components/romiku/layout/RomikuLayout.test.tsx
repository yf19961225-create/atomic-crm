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

  it("renders the ROMIKU wordmark and Chinese primary navigation", async () => {
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

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    await expect.element(navigation).toBeVisible();

    const expectedLinks = [
      ["工作台", "/"],
      ["网站询盘", "/website-inquiries"],
      ["外贸开发", "/outbound-development"],
      ["正式客户", "/formal-customers"],
      ["报价单", "/quotes"],
      ["PI", "/pi"],
      ["订单", "/orders"],
      ["生产", "/production"],
      ["装箱与发货", "/packing-shipping"],
      ["日历", "/calendar"],
      ["供应商", "/suppliers"],
      ["产品库", "/product-library"],
      ["设置", "/settings"],
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
      .element(screen.getByRole("button", { name: "打开主导航" }))
      .toBeVisible();

    await screen.getByRole("button", { name: "打开主导航" }).click();
    await expect
      .element(screen.getByText("移动端侧边栏", { exact: true }))
      .toBeVisible();
  });
});

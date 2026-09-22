import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { romikuRoutes } from "../routes/RomikuRoutes";
import "@/index.css";
import { page } from "vitest/browser";

beforeEach(async () => {
  await page.viewport(1440, 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

const list = {
  pagination: { page: 1, perPage: 100 },
  sort: { field: "id", order: "ASC" as const },
  filter: {},
};
const seed = () => ({
  sales: [],
  romiku_outbound_companies: [
    { id: "out-1", name: "Original company", status: "to_develop" },
  ],
  romiku_outbound_contacts: [],
  romiku_outbound_followups: [],
  romiku_source_urls: [],
  romiku_formal_customers: [],
  romiku_customer_contacts: [],
  romiku_website_inquiries: [
    {
      id: "in-1",
      document_number: "WI-001",
      customer_name: "Ana",
      company: "Original company",
      email: "ana@example.com",
      message: "Original request",
      status: "new",
      raw_payload: {
        items: [
          { sku: "UNKNOWN", quantity: 20, requirement: "White packaging" },
        ],
      },
    },
  ],
  romiku_website_inquiry_items: [
    {
      id: "item-1",
      inquiry_id: "in-1",
      sku: "UNKNOWN",
      quantity: 20,
      requirement: "White packaging",
      match_status: "not_found",
    },
  ],
  romiku_website_inquiry_followups: [],
});
const setup = async (path: string, data = seed()) => {
  const provider = fakeRestDataProvider(data);
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
};

describe("independent ROMIKU workflows", () => {
  it("presents relationship workflow labels in Simplified Chinese while preserving stored identifiers", async () => {
    const { screen } = await setup("/outbound-development");

    await expect
      .element(screen.getByRole("heading", { name: "外贸开发" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "新建外贸开发公司" }))
      .toBeVisible();
    await expect
      .element(screen.getByLabelText("筛选状态", { exact: true }))
      .toBeVisible();
  });

  it("creates outbound companies without creating or merging inquiries or customers", async () => {
    const { screen, provider } = await setup("/outbound-development");
    await screen.getByRole("button", { name: "新建外贸开发公司" }).click();
    await screen
      .getByLabelText("公司名称", { exact: true })
      .fill("Original company");
    await screen.getByRole("button", { name: "保存记录" }).click();
    await expect
      .poll(
        async () =>
          (await provider.getList("romiku_outbound_companies", list)).data
            .length,
      )
      .toBe(2);
    expect(
      (await provider.getList("romiku_formal_customers", list)).data,
    ).toEqual([]);
    expect(
      (await provider.getList("romiku_website_inquiries", list)).data,
    ).toHaveLength(1);
  });

  it("preserves multiple contacts and leaves company status manual after a follow-up", async () => {
    const { screen, provider } = await setup(
      "/outbound-development?record=out-1",
    );
    await screen.getByRole("tab", { name: "联系人" }).click();
    for (const name of ["Buyer", "Director"]) {
      await screen.getByLabelText("联系人姓名", { exact: true }).fill(name);
      await screen
        .getByRole("button", { name: "新增联系人", exact: true })
        .click();
      await expect
        .element(screen.getByRole("button", { name: `编辑${name}` }))
        .toBeVisible();
    }
    await screen.getByRole("tab", { name: "跟进" }).click();
    await screen
      .getByLabelText("关联联系人", { exact: true })
      .selectOptions(
        screen.getByRole("option", { name: "Buyer", exact: true }),
      );
    await screen
      .getByLabelText("摘要", { exact: true })
      .fill("Sent introduction");
    await screen
      .getByLabelText("联系时间", { exact: true })
      .fill("2026-09-10T10:00");
    await screen
      .getByLabelText("下次跟进", { exact: true })
      .fill("2026-09-12T10:00");
    await screen.getByRole("button", { name: "新增跟进", exact: true }).click();
    await expect
      .element(screen.getByText("Sent introduction", { exact: true }))
      .toBeVisible();
    expect(
      (await provider.getList("romiku_outbound_contacts", list)).data,
    ).toHaveLength(2);
    const buyer = (
      await provider.getList("romiku_outbound_contacts", list)
    ).data.find((contact) => contact.name === "Buyer")!;
    expect(
      String(
        (await provider.getList("romiku_outbound_followups", list)).data[0]
          .contact_id,
      ),
    ).toBe(String(buyer.id));
    expect(
      (await provider.getOne("romiku_outbound_companies", { id: "out-1" })).data
        .status,
    ).toBe("to_develop");
    expect(
      (await provider.getList("romiku_formal_customers", list)).data,
    ).toEqual([]);
    await screen.getByRole("tab", { name: "档案" }).click();
    await screen
      .getByLabelText("状态", { exact: true })
      .selectOptions("replied");
    await screen.getByRole("button", { name: "保存记录" }).click();
    await expect
      .poll(
        async () =>
          (await provider.getOne("romiku_outbound_companies", { id: "out-1" }))
            .data.status,
      )
      .toBe("replied");
  });

  it("resets a saved follow-up with a new contacted timestamp", async () => {
    vi.setSystemTime(new Date("2026-09-17T10:00:00Z"));
    const { screen } = await setup("/outbound-development?record=out-1");
    await screen.getByRole("tab", { name: "跟进" }).click();
    const contactedAt = screen.getByLabelText("联系时间", { exact: true });
    const initialContactedAt = (contactedAt.element() as HTMLInputElement)
      .value;

    vi.setSystemTime(new Date("2026-09-17T10:01:00Z"));
    await screen
      .getByLabelText("摘要", { exact: true })
      .fill("Sent introduction");
    await screen.getByRole("button", { name: "新增跟进", exact: true }).click();
    await expect
      .element(screen.getByText("Sent introduction", { exact: true }))
      .toBeVisible();

    await expect.element(contactedAt).not.toHaveValue(initialContactedAt);
  });

  it("keeps submitted inquiry items and raw values immutable when handling and following up", async () => {
    const before = seed();
    const { screen, provider } = await setup(
      "/website-inquiries?record=in-1",
      before,
    );
    await screen.getByRole("tab", { name: "原始提交" }).click();
    await expect
      .element(screen.getByText("UNKNOWN", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("White packaging", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("商品匹配：未匹配")).toBeVisible();
    await screen.getByRole("tab", { name: "档案" }).click();
    await screen
      .getByLabelText("处理备注", { exact: true })
      .fill("Manual review");
    await screen
      .getByLabelText("状态", { exact: true })
      .selectOptions("processed");
    await screen.getByRole("button", { name: "保存记录" }).click();
    await expect
      .poll(
        async () =>
          (await provider.getOne("romiku_website_inquiries", { id: "in-1" }))
            .data.status,
      )
      .toBe("processed");
    await screen.getByRole("tab", { name: "跟进" }).click();
    await screen
      .getByLabelText("摘要", { exact: true })
      .fill("Replied to website request");
    await screen.getByRole("button", { name: "新增跟进", exact: true }).click();
    await expect
      .element(screen.getByText("Replied to website request", { exact: true }))
      .toBeVisible();
    expect(
      (await provider.getList("romiku_website_inquiry_items", list)).data,
    ).toEqual(before.romiku_website_inquiry_items);
    expect(
      (await provider.getOne("romiku_website_inquiries", { id: "in-1" })).data,
    ).toMatchObject({
      ...before.romiku_website_inquiries[0],
      status: "processed",
      processing_notes: "Manual review",
    });
    expect(
      (await provider.getList("romiku_outbound_followups", list)).data,
    ).toEqual([]);
    expect(
      (await provider.getList("romiku_formal_customers", list)).data,
    ).toEqual([]);
  });

  it("manually creates a customer and links source history without moving the source", async () => {
    const { screen, provider } = await setup("/formal-customers");
    await screen.getByRole("button", { name: "新建正式客户" }).click();
    await screen
      .getByLabelText("客户名称", { exact: true })
      .fill("Actual customer");
    await screen
      .getByLabelText("来源外贸开发公司", { exact: true })
      .selectOptions("out-1");
    await screen.getByRole("button", { name: "保存记录" }).click();
    await expect
      .poll(
        async () =>
          (await provider.getList("romiku_formal_customers", list)).data.length,
      )
      .toBe(1);
    const customer = (await provider.getList("romiku_formal_customers", list))
      .data[0];
    expect(customer.source_outbound_company_id).toBe("out-1");
    expect(
      (await provider.getOne("romiku_outbound_companies", { id: "out-1" }))
        .data,
    ).toEqual(seed().romiku_outbound_companies[0]);
    await screen.getByRole("tab", { name: "联系人" }).click();
    for (const name of ["Accounts", "Receiving"]) {
      await screen.getByLabelText("联系人姓名", { exact: true }).fill(name);
      await screen
        .getByRole("button", { name: "新增联系人", exact: true })
        .click();
      await expect
        .element(screen.getByRole("button", { name: `编辑${name}` }))
        .toBeVisible();
    }
    expect(
      (await provider.getList("romiku_customer_contacts", list)).data,
    ).toHaveLength(2);
    await screen.getByRole("tab", { name: "来源历史" }).click();
    await screen
      .getByLabelText("要关联的网站询盘", { exact: true })
      .selectOptions("in-1");
    await screen
      .getByRole("button", { name: "关联所选询盘", exact: true })
      .click();
    await expect
      .element(screen.getByRole("link", { name: "WI-001 · Ana" }))
      .toBeVisible();
    expect(
      (await provider.getOne("romiku_website_inquiries", { id: "in-1" })).data,
    ).toEqual({
      ...seed().romiku_website_inquiries[0],
      formal_customer_id: customer.id,
    });
  });

  it("saves a typed source URL without submitting unrelated unsaved company edits", async () => {
    const { screen, provider } = await setup(
      "/outbound-development?record=out-1",
    );
    await screen
      .getByLabelText("公司名称", { exact: true })
      .fill("Not saved yet");
    await screen.getByRole("tab", { name: "来源", exact: true }).click();
    await screen
      .getByLabelText("来源链接", { exact: true })
      .fill("https://example.com/research");
    await screen
      .getByRole("button", { name: "新增来源链接", exact: true })
      .click();
    await expect
      .element(
        screen.getByRole("link", {
          name: "网站：https://example.com/research",
        }),
      )
      .toBeVisible();
    expect(
      (await provider.getOne("romiku_outbound_companies", { id: "out-1" })).data
        .name,
    ).toBe("Original company");
  });

  it("accepts a bare outbound website and stores a clickable normalized URL", async () => {
    const { screen, provider } = await setup("/outbound-development");
    await screen.getByRole("button", { name: "新建外贸开发公司" }).click();
    await screen.getByLabelText("公司名称", { exact: true }).fill("Bare URL");
    await screen.getByLabelText("网站", { exact: true }).fill("romiku.com");
    await screen.getByRole("button", { name: "保存记录" }).click();
    const records = (await provider.getList("romiku_outbound_companies", list))
      .data;
    const record = records.find((row) => row.name === "Bare URL");
    expect(record?.website).toBe("https://romiku.com");
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { InquiryPage } from "./InquiryPage";
import { statusOptions } from "../shared/workflowStatus";
import "@/index.css";

vi.mock("../search/useBusinessSearch", () => ({
  useModuleSearch: () => ({ active: false }),
}));
const inquiry = {
  id: "i1",
  document_number: "WI-001",
  customer_name: "Buyer",
  company: "Company",
  country: "Colombia",
  submitted_at: "2026-10-06T01:00:00Z",
  email: "buyer@example.test",
  whatsapp: "+57 300 123 4567",
  message: "Keep original message",
  status: "pending_screening",
  raw_payload: { original: true },
};
async function setup(path = "/website-inquiries") {
  const provider = fakeRestDataProvider({
    sales: [],
    romiku_website_inquiries: [inquiry],
    romiku_website_inquiry_items: [],
    romiku_website_inquiry_followups: [],
    romiku_outbound_companies: [],
    romiku_formal_customers: [],
  });
  const cache = new QueryClient();
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <InquiryPage />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { provider, cache, screen };
}
beforeEach(async () => {
  await page.viewport(1440, 1000);
});
it("persists all eight single-row statuses, clears selection and invalidates linked caches", async () => {
  const { screen, provider, cache } = await setup();
  const invalidation = vi.spyOn(cache, "invalidateQueries");
  const update = vi.spyOn(provider, "update");
  for (const { value } of statusOptions("website_inquiry")
    .slice(1)
    .concat(statusOptions("website_inquiry").slice(0, 1))) {
    await screen.getByRole("checkbox", { name: "全选当前页" }).click();
    await screen
      .getByRole("combobox", { name: "状态 WI-001", exact: true })
      .selectOptions(value);
    await expect
      .poll(
        async () =>
          (await provider.getOne("romiku_website_inquiries", { id: "i1" })).data
            .status,
      )
      .toBe(value);
    await expect
      .element(screen.getByRole("button", { name: "取消选择" }))
      .not.toBeInTheDocument();
    await expect
      .element(
        screen.getByRole("combobox", { name: "状态 WI-001", exact: true }),
      )
      .toHaveValue(value);
  }
  expect(invalidation).toHaveBeenCalled();
  for (const [resource, params] of update.mock.calls) {
    expect(resource).toBe("romiku_website_inquiries");
    expect(Object.keys(params.data)).toEqual(["status"]);
  }
  expect(
    (await provider.getOne("romiku_website_inquiries", { id: "i1" })).data,
  ).toMatchObject(inquiry);
  await screen.unmount();
  const reopened = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <InquiryPage />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(
      reopened.getByRole("combobox", { name: "状态 WI-001", exact: true }),
    )
    .toHaveValue("pending_screening");
});
it("rolls back failed status edits and shows the returned reason", async () => {
  const { screen, provider } = await setup();
  vi.spyOn(provider, "update").mockRejectedValue(
    new Error("当前登录已失效，请重新登录。"),
  );
  await screen
    .getByRole("combobox", { name: "状态 WI-001", exact: true })
    .selectOptions("quoted");
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("当前登录已失效");
  await expect
    .element(screen.getByRole("combobox", { name: "状态 WI-001", exact: true }))
    .toHaveValue("pending_screening");
});
it("shows original contact information on the main detail tab and saves only handling fields", async () => {
  const { screen, provider, cache } = await setup(
    "/website-inquiries?record=i1",
  );
  const invalidation = vi.spyOn(cache, "invalidateQueries");
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByText("+57 300 123 4567", { exact: true }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Keep original message", { exact: true }))
    .toBeVisible();
  await screen
    .getByLabelText("状态", { exact: true })
    .selectOptions("following_up");
  await screen
    .getByLabelText("处理备注", { exact: true })
    .fill("Contacted buyer");
  await screen.getByRole("button", { name: "保存记录" }).click();
  await expect
    .element(screen.getByText("记录已保存。", { exact: true }))
    .toBeVisible();
  expect(
    (await provider.getOne("romiku_website_inquiries", { id: "i1" })).data,
  ).toMatchObject({
    ...inquiry,
    status: "following_up",
    processing_notes: "Contacted buyer",
  });
  expect(invalidation).toHaveBeenCalled();
});
it("renders ten columns with bounded contact and grouped followup content", async () => {
  const { screen, provider } = await setup();
  for (const [id, email, whatsapp] of [
    ["i2", "only@example.test", null],
    ["i3", null, "+57 300 222 2222"],
    ["i4", null, null],
    ["i5", "long".repeat(55) + "@example.test", "+57 " + "123 456 ".repeat(10)],
  ]) {
    await provider.create("romiku_website_inquiries", {
      data: { ...inquiry, id, document_number: `WI-${id}`, email, whatsapp },
    });
  }
  // Refetch all list queries through an ordinary filter change.
  await screen
    .getByRole("combobox", { name: "筛选状态" })
    .selectOptions("pending_screening");
  await expect
    .element(screen.getByText("第 1 页 · 共 5 条记录", { exact: true }))
    .toBeVisible();
  const headers = Array.from(document.querySelectorAll("thead th")).map((x) =>
    x.textContent?.trim(),
  );
  expect(headers).toEqual([
    "",
    "询盘／客户",
    "国家／地区",
    "提交时间",
    "联系方式",
    "状态",
    "负责人",
    "跟进",
    "到期状态",
    "操作",
  ]);
  const rows = Array.from(document.querySelectorAll("tbody tr"));
  const first = rows.find((row) => row.textContent?.includes("WI-001"))!;
  expect(first.querySelectorAll("td")[4].textContent).toBe(
    "buyer@example.testWhatsApp: +57 300 123 4567",
  );
  expect(first.querySelectorAll("td")[7].textContent).toBe(
    "最近：—下次：—0 次",
  );
  expect(
    document.querySelector("table")?.classList.contains("table-fixed"),
  ).toBe(true);
  const cells = rows.map((row) => row.querySelectorAll("td")[4]);
  expect(cells.map((x) => x.textContent)).toEqual(
    expect.arrayContaining([
      "only@example.test",
      "WhatsApp: +57 300 222 2222",
      "—",
    ]),
  );
  const long = cells.find((x) => x.textContent?.includes("longlong"))!;
  expect(long.querySelectorAll(".truncate")).toHaveLength(2);
  expect(long.querySelector("[title]")).not.toBeNull();
});

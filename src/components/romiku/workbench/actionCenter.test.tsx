import { render } from "vitest-browser-react";
import { CoreAdminContext, type AuthProvider } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Route, Routes } from "react-router";
import { RomikuWorkbench } from "./RomikuWorkbench";
import { romikuRoutes } from "../routes/RomikuRoutes";

const event = (
  id: string,
  type: string,
  table: string,
  owner = "user-one",
  due = "2026-09-17T10:00:00Z",
) => ({
  id: `${type}:${id}`,
  source_id: id,
  event_type: type,
  source_table: table,
  title: id,
  owner_id: owner,
  due_at: due,
  status: "pending",
  is_overdue: true,
});
const seed = () => ({
  sales: [
    { id: 1, user_id: "user-one", first_name: "Alice", last_name: "One" },
    { id: 2, user_id: "user-two", first_name: "Bob", last_name: "Two" },
  ],
  romiku_calendar: [
    event("WI-due", "inquiry_follow_up", "romiku_website_inquiries"),
    event(
      "OUT-due",
      "outbound_follow_up",
      "romiku_outbound_companies",
      "user-two",
    ),
  ],
  romiku_workbench: [
    event(
      "OUT-old",
      "outbound_follow_up",
      "romiku_outbound_companies",
      "user-two",
      "2026-09-10T10:00:00Z",
    ),
    event(
      "OUT-next",
      "outbound_follow_up",
      "romiku_outbound_companies",
      "user-one",
      "2099-09-10T10:00:00Z",
    ),
  ],
  romiku_website_inquiries: [
    {
      id: "WI-new",
      document_number: "WI-new",
      status: "new",
      owner_id: "user-one",
    },
    {
      id: "WI-pending",
      document_number: "WI-pending",
      status: "pending",
      owner_id: "user-two",
    },
  ],
  romiku_quotes: [
    {
      id: "Q-open",
      document_number: "Q-open",
      status: "draft",
      owner_id: "user-one",
    },
    { id: "Q-closed", document_number: "Q-closed", status: "declined" },
  ],
  romiku_pis: [{ id: "PI-open", document_number: "PI-open", status: "sent" }],
  romiku_order_totals: [
    {
      id: "O-deposit",
      document_number: "O-deposit",
      status: "confirmed",
      remaining_amount: 100,
      deposit_remaining: 30,
      currency: "USD",
      deposit_due_at: "2026-09-01T10:00:00Z",
    },
  ],
  romiku_production_orders: [
    {
      id: "PO-open",
      document_number: "PO-open",
      status: "in_production",
      factory_due_at: "2026-09-02T10:00:00Z",
      anomaly_flags: ["delay"],
    },
  ],
  romiku_packing_lists: [
    {
      id: "PL-open",
      document_number: "PL-open",
      packing_at: "2026-09-18T10:00:00Z",
    },
  ],
  romiku_manual_tasks: [],
  romiku_outbound_companies: [{ id: "OUT-old", name: "Buyer" }],
});
async function setup(path = "/") {
  const provider = fakeRestDataProvider(seed());
  const authProvider = {
    getIdentity: async () => ({ id: 1 }),
    checkAuth: async () => {},
    checkError: async () => {},
    login: async () => {},
    logout: async () => {},
  } as AuthProvider;
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider} authProvider={authProvider}>
        <Routes>
          <Route path="/" element={<RomikuWorkbench />} />
          {romikuRoutes}
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
}
it("separates Website and Outbound action counts and links every action to its source", async () => {
  const { screen } = await setup();
  for (const title of [
    "新网站询盘",
    "待处理网站询盘／跟进",
    "外贸开发跟进",
    "逾期外贸开发跟进",
    "待处理报价单",
    "待处理形式发票",
    "待收定金",
    "待收尾款",
    "生产／到期事项",
    "装箱／发运",
  ]) {
    await expect
      .element(screen.getByRole("button", { name: `${title}: 1`, exact: true }))
      .toBeVisible();
  }
  await screen
    .getByRole("button", { name: "新网站询盘: 1", exact: true })
    .click();
  await expect
    .element(screen.getByRole("link", { name: "WI-new", exact: true }))
    .toHaveAttribute("href", "/website-inquiries?record=WI-new");
  await expect
    .element(screen.getByRole("link", { name: "OUT-old", exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "全部待办", exact: true }).click();
  await expect
    .element(screen.getByRole("link", { name: "Q-open", exact: true }))
    .toHaveAttribute("href", "/quotes/Q-open");
  await expect
    .element(screen.getByRole("link", { name: "Q-closed", exact: true }))
    .not.toBeInTheDocument();
  const links = [
    ...screen.getByRole("table").element().querySelectorAll("tbody a"),
  ].map((a) => a.textContent);
  expect(links.indexOf("O-deposit")).toBeLessThan(links.indexOf("WI-new"));
});
it("shows date aggregation with owner and only-mine filters using auth UUID mapping", async () => {
  const { screen } = await setup("/calendar");
  await expect.element(screen.getByText("日历", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByLabelText("负责人", { exact: true }))
    .toBeVisible();
  await screen.getByLabelText("仅看我的", { exact: true }).click();
  await screen.getByLabelText("仅看我的", { exact: true }).click();
  await screen
    .getByLabelText("负责人", { exact: true })
    .selectOptions("user-two");
  await expect
    .element(screen.getByLabelText("来源类型", { exact: true }))
    .toBeVisible();
});
it("creates and completes manual tasks with one supported source without writing calendar events", async () => {
  const { screen, provider } = await setup("/calendar/tasks/new");
  await screen.getByLabelText("任务标题", { exact: true }).fill("Call buyer");
  await screen
    .getByLabelText("关联来源", { exact: true })
    .selectOptions("outbound_company_id");
  await screen
    .getByLabelText("来源记录", { exact: true })
    .selectOptions("OUT-old");
  await screen
    .getByLabelText("优先级", { exact: true })
    .selectOptions("urgent");
  await screen.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect
    .element(screen.getByRole("link", { name: "打开关联来源", exact: true }))
    .toHaveAttribute("href", "/outbound-development?record=OUT-old");
  const list = {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "id", order: "ASC" as const },
    filter: {},
  };
  const tasks = (await provider.getList("romiku_manual_tasks", list)).data;
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    title: "Call buyer",
    priority: "urgent",
    outbound_company_id: "OUT-old",
    quote_id: null,
  });
  expect((await provider.getList("romiku_calendar", list)).data).toHaveLength(
    2,
  );
  await screen.getByLabelText("已完成", { exact: true }).click();
  await screen.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_manual_tasks", { id: tasks[0].id })).data
          .completed_at,
    )
    .toBeTruthy();
});

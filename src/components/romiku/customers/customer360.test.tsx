import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoreAdminContext, testDataProvider } from "ra-core";
import { Customer360 } from "./Customer360";
import { OrderCustomerArchive } from "./OrderCustomerArchive";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const card = (id: string) => ({
  id,
  document_number: id,
  document_date: "2026-10-04",
  status: "confirmed",
  currency: "USD",
  total: 200,
  source_quotes: [],
  source_pi: null,
  productions: [],
  packings: [],
  payments: [],
  payment_summary: { total: 200, paid: 50, balance: 150 },
});
beforeEach(() => rpc.mockReset());
function mount(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={testDataProvider({
          getList: async () => ({ data: [], total: 0 }),
        })}
      >
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          {node}
        </QueryClientProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );
}
it("groups Orders without per-Order requests and paginates server-side", async () => {
  rpc.mockImplementation(async (name, args) => ({
    data:
      name === "romiku_customer_business_history"
        ? {
            total_count: 11,
            has_more: args.offset === 0,
            orders: [card(args.offset ? "OD11" : "OD01")],
            summary: {
              order_count: 11,
              in_progress: 11,
              completed: 0,
              totals: [
                { currency: "USD", amount: 200 },
                { currency: "EUR", amount: 300 },
              ],
              latest: null,
            },
          }
        : { items: [], total_count: 0, has_more: false },
    error: null,
  }));
  const screen = await mount(
    <Customer360
      record={{ id: "a", name: "Customer A" }}
      profile={<p>Master fields</p>}
    />,
  );
  await expect
    .element(screen.getByRole("link", { name: "OD01", exact: true }))
    .toBeVisible();
  expect(
    rpc.mock.calls.filter((c) => c[0] === "romiku_customer_business_history"),
  ).toHaveLength(1);
  await screen.getByRole("button", { name: "下一页", exact: true }).click();
  await expect
    .element(screen.getByRole("link", { name: "OD11", exact: true }))
    .toBeVisible();
  expect(rpc).toHaveBeenLastCalledWith(
    "romiku_customer_business_history",
    expect.objectContaining({ customer_id: "a", offset: 10 }),
  );
  await screen.getByRole("searchbox").fill("SUN5");
  await expect
    .poll(() =>
      rpc.mock.calls.some(
        (c) =>
          c[1].query === "SUN5" &&
          c[1].customer_id === "a" &&
          c[1].offset === 0,
      ),
    )
    .toBe(true);
  await screen.getByRole("tab", { name: "客户资料", exact: true }).click();
  await expect.element(screen.getByText("Master fields")).toBeVisible();
});
it("archive cancel never mutates; confirmation submits only relationship parameters", async () => {
  rpc.mockImplementation(async (name) => ({
    data:
      name === "romiku_customer_archive_plan"
        ? {
            token: "token-1",
            documents: [
              {
                id: "o",
                resource_type: "order",
                document_number: "OD1",
                formal_customer_id: "a",
              },
              {
                id: "q",
                resource_type: "quote",
                document_number: "RFQ1",
                formal_customer_id: null,
              },
            ],
          }
        : { ok: true, customer_id: "a" },
    error: null,
  }));
  const screen = await mount(
    <OrderCustomerArchive record={{ id: "o", formal_customer_id: "a" }} />,
  );
  await screen.getByRole("button", { name: "客户归档", exact: true }).click();
  await screen
    .getByRole("button", { name: "预览归档范围", exact: true })
    .click();
  await expect.element(screen.getByText("RFQ1", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(
    rpc.mock.calls.some((c) => c[0] === "romiku_confirm_customer_archive"),
  ).toBe(false);
  await screen
    .getByRole("button", { name: "预览归档范围", exact: true })
    .click();
  await screen.getByRole("button", { name: "确认归档", exact: true }).click();
  await expect
    .poll(() =>
      rpc.mock.calls.some((c) => c[0] === "romiku_confirm_customer_archive"),
    )
    .toBe(true);
  expect(
    rpc.mock.calls.find((c) => c[0] === "romiku_confirm_customer_archive")?.[1],
  ).toEqual({
    order_id: "o",
    customer_id: "a",
    include_history: true,
    expected_token: "token-1",
    new_customer_name: null,
  });
});
it("all-documents uses customer-scoped RPC and links matched records", async () => {
  rpc.mockImplementation(async (name) => ({
    data:
      name === "romiku_customer_documents"
        ? {
            total_count: 1,
            has_more: false,
            items: [
              {
                id: "prod1",
                resource_type: "production",
                document_number: "OD1-P01",
                order_id: "o1",
                order_number: "OD1",
                document_date: "2026-10-04",
                status: "pending",
              },
            ],
          }
        : {
            total_count: 0,
            has_more: false,
            orders: [],
            summary: {
              order_count: 0,
              in_progress: 0,
              completed: 0,
              totals: [],
              latest: null,
            },
          },
    error: null,
  }));
  const screen = await mount(
    <Customer360 record={{ id: "a", name: "A" }} profile={<p>Profile</p>} />,
  );
  await screen.getByRole("tab", { name: "全部单据", exact: true }).click();
  await screen
    .getByLabelText("单据类型", { exact: true })
    .selectOptions("production");
  await expect
    .element(screen.getByRole("link", { name: "OD1-P01", exact: true }))
    .toHaveAttribute("href", "/production/prod1");
  await expect
    .element(screen.getByRole("link", { name: "OD1", exact: true }))
    .toHaveAttribute("href", "/orders/o1");
  expect(
    rpc.mock.calls.some(
      (c) =>
        c[0] === "romiku_customer_documents" &&
        c[1].customer_id === "a" &&
        c[1].resource_type === "production",
    ),
  ).toBe(true);
});
it("archive conflicts show a readable reason without exposing database errors", async () => {
  rpc.mockImplementation(async (name) =>
    name === "romiku_customer_archive_plan"
      ? {
          data: {
            token: "t",
            documents: [
              {
                id: "o",
                resource_type: "order",
                document_number: "OD1",
                formal_customer_id: "a",
              },
            ],
          },
          error: null,
        }
      : {
          data: null,
          error: {
            code: "23514",
            message: "raw database constraint internal_table",
          },
        },
  );
  const screen = await mount(
    <OrderCustomerArchive record={{ id: "o", formal_customer_id: "a" }} />,
  );
  await screen.getByRole("button", { name: "客户归档", exact: true }).click();
  await screen
    .getByRole("button", { name: "预览归档范围", exact: true })
    .click();
  await screen.getByRole("button", { name: "确认归档", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("来源链已有其他客户关联，归档未执行。");
});

it("keeps unsaved customer profile input when switching history tabs", async () => {
  rpc.mockResolvedValue({
    data: {
      total_count: 0,
      has_more: false,
      orders: [],
      summary: {
        order_count: 0,
        in_progress: 0,
        completed: 0,
        totals: [],
        latest: null,
      },
    },
    error: null,
  });
  const screen = await mount(
    <Customer360
      record={{ id: "a", name: "A" }}
      profile={<input aria-label="Master name draft" defaultValue="Before" />}
    />,
  );
  await screen.getByRole("tab", { name: "客户资料", exact: true }).click();
  await screen.getByLabelText("Master name draft").fill("Unsaved change");
  await screen.getByRole("tab", { name: "业务记录", exact: true }).click();
  await screen.getByRole("tab", { name: "客户资料", exact: true }).click();
  await expect
    .element(screen.getByLabelText("Master name draft"))
    .toHaveValue("Unsaved change");
});

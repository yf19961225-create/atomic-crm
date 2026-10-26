import "@/index.css";
import { expect, it } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { WorkflowFields } from "../outbound/WorkflowFields";
import type { Values } from "../outbound/WorkflowFields";
it("opens a shared calendar at an existing business datetime without changing the stored instant", async () => {
  function Fixture() {
    const [value, set] = useState<Values>({ when: "2026-10-25T12:34:56.789Z" });
    return (
      <>
        <WorkflowFields
          fields={[{ key: "when", label: "验收时间", type: "datetime-local" }]}
          values={value}
          onChange={set}
        />
        <output>{String(value.when)}</output>
      </>
    );
  }
  const screen = await render(<Fixture />);
  await screen
    .getByRole("button", { name: "打开验收时间日历", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("日历月份", { exact: true }))
    .toHaveValue("10");
  await expect
    .element(screen.getByText("2026-10-25T12:34:56.789Z", { exact: true }))
    .toBeVisible();
});

it("selects a date with month/year controls, supports today/clear, and opening alone stays clean", async () => {
  const changes: unknown[] = [];
  function Fixture() {
    const [value, set] = useState<string | null>("2024-02-29");
    return (
      <WorkflowFields
        fields={[{ key: "document_date", label: "业务日期" }]}
        values={{ document_date: value }}
        onChange={(next) => {
          changes.push(next.document_date);
          set(next.document_date as string | null);
        }}
      />
    );
  }
  const screen = await render(<Fixture />);
  await screen
    .getByRole("button", { name: "打开业务日期日历", exact: true })
    .click();
  expect(changes).toEqual([]);
  await expect
    .element(screen.getByLabelText("日历年份", { exact: true }))
    .toHaveValue("2024");
  await screen
    .getByLabelText("日历年份", { exact: true })
    .selectOptions("2026");
  await screen.getByLabelText("日历月份", { exact: true }).selectOptions("10");
  await screen.getByRole("button", { name: "2026-10-31", exact: true }).click();
  await expect.poll(() => changes).toEqual(["2026-10-31"]);
  await expect
    .element(screen.getByLabelText("业务日期", { exact: true }))
    .toHaveValue("2026-10-31");
  await screen
    .getByRole("button", { name: "打开业务日期日历", exact: true })
    .click();
  await screen.getByRole("button", { name: "清空日期", exact: true }).click();
  expect(changes.at(-1)).toBeNull();
  await screen
    .getByRole("button", { name: "打开业务日期日历", exact: true })
    .click();
  await screen.getByRole("button", { name: "今天", exact: true }).click();
  const today = new Date();
  expect(changes.at(-1)).toBe(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  );
});
it("required business dates have no calendar clear action and no automatic today default", async () => {
  const screen = await render(
    <WorkflowFields
      fields={[{ key: "document_date", label: "必填日期", required: true }]}
      values={{}}
      onChange={() => {}}
    />,
  );
  await expect
    .element(screen.getByLabelText("必填日期", { exact: true }))
    .toHaveValue("");
  await screen
    .getByRole("button", { name: "打开必填日期日历", exact: true })
    .click();
  await expect
    .element(screen.getByRole("button", { name: "清空日期", exact: true }))
    .not.toBeInTheDocument();
});

it.each([
  "document_date",
  "valid_until",
  "reference_date",
  "effective_date",
  "terms_snapshot.valid_until",
  "terms_snapshot.expected_delivery",
])("%s uses a date-only calendar without timezone conversion", async (key) => {
  let value: Values = {};
  const screen = await render(
    <WorkflowFields
      fields={[{ key, label: "日期覆盖" }]}
      values={value}
      onChange={(next) => {
        value = next;
      }}
    />,
  );
  await expect
    .element(screen.getByLabelText("日期覆盖", { exact: true }))
    .toHaveAttribute("type", "date");
  await screen
    .getByRole("button", { name: "打开日期覆盖日历", exact: true })
    .click();
  await screen
    .getByLabelText("日历年份", { exact: true })
    .selectOptions("2026");
  await screen.getByLabelText("日历月份", { exact: true }).selectOptions("10");
  await screen.getByRole("button", { name: "2026-10-31", exact: true }).click();
  const { valueAt } = await import("../outbound/WorkflowFields");
  expect(valueAt(value, key)).toBe("2026-10-31");
});
it.each([
  "due_at",
  "deposit_due_at",
  "balance_due_at",
  "expected_delivery_at",
  "actual_delivery_at",
  "contacted_at",
  "next_follow_up_at",
  "packing_at",
  "received_at",
])(
  "%s keeps datetime time and precision when changing calendar date",
  async (key) => {
    let value: Values = { [key]: "2026-10-25T12:34:56.789Z" };
    const screen = await render(
      <WorkflowFields
        fields={[{ key, label: "时间覆盖" }]}
        values={value}
        onChange={(next) => {
          value = next;
        }}
      />,
    );
    await expect
      .element(screen.getByLabelText("时间覆盖", { exact: true }))
      .toHaveAttribute("type", "datetime-local");
    await screen
      .getByRole("button", { name: "打开时间覆盖日历", exact: true })
      .click();
    await screen
      .getByRole("button", { name: "2026-10-31", exact: true })
      .click();
    expect(value[key]).toBe("2026-10-31T12:34:56.789Z");
  },
);

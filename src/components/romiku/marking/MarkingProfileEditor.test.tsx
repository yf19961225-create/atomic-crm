import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MarkingProfileEditor } from "./MarkingProfileEditor";

it("saves customer defaults and Production edits independently, retaining hidden text", async () => {
  const profile = {
    front_mark: { mode: "text", text: "Old front" },
    side_mark: { mode: "text", text: "Old side" },
    labeling_requirements: "Old label",
  };
  const customer = { id: "c", marking_profile: profile };
  const production = { id: "p", marking_snapshot: structuredClone(profile) };
  const provider = fakeRestDataProvider({
    romiku_formal_customers: [customer],
    romiku_production_orders: [production],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <MarkingProfileEditor kind="production" record={production} />
    </CoreAdminContext>,
  );
  await screen.getByText("唛头与标签", { exact: true }).click();
  await screen.getByLabelText("正唛文字").fill("Production front");
  await screen.getByLabelText("侧唛显示方式").selectOptions("none");
  await screen.getByLabelText("贴标要求").fill("Production label");
  await screen
    .getByLabelText("订单要求 / 生产要求")
    .fill("Production requirement");
  await screen.getByRole("button", { name: "保存唛头与标签" }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_production_orders", { id: "p" })).data
          .marking_snapshot.front_mark.text,
    )
    .toBe("Production front");
  const saved = (await provider.getOne("romiku_production_orders", { id: "p" }))
    .data.marking_snapshot;
  expect(saved.side_mark).toMatchObject({ mode: "none", text: "Old side" });
  expect(saved.labeling_requirements).toBe("Production label");
  expect(saved.production_requirements).toBe("Production requirement");
  expect(
    (await provider.getOne("romiku_formal_customers", { id: "c" })).data
      .marking_profile,
  ).toEqual(profile);
});
it("saves customer text and mode as defaults without modifying existing Production", async () => {
  const customer = { id: "c", marking_profile: {} };
  const provider = fakeRestDataProvider({
    romiku_formal_customers: [customer],
    romiku_production_orders: [
      {
        id: "p",
        marking_snapshot: { front_mark: { mode: "text", text: "Historical" } },
      },
    ],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <MarkingProfileEditor kind="customer" record={customer} />
    </CoreAdminContext>,
  );
  await screen.getByText("包装 / 唛头资料", { exact: true }).click();
  await screen.getByLabelText("侧唛文字").fill("ABC NAILS\nMADE IN CHINA");
  await screen.getByLabelText("侧唛显示方式").selectOptions("text");
  await screen.getByLabelText("贴标要求").fill("右上角");
  await screen.getByRole("button", { name: "保存包装 / 唛头资料" }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_formal_customers", { id: "c" })).data
          .marking_profile.side_mark.text,
    )
    .toBe("ABC NAILS\nMADE IN CHINA");
  expect(
    (await provider.getOne("romiku_production_orders", { id: "p" })).data
      .marking_snapshot.front_mark.text,
  ).toBe("Historical");
});

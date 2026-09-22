import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import fakeRestDataProvider from "ra-data-fakerest";
import { CoreAdminContext } from "ra-core";
import { InlineStatusSelect } from "./InlineStatusSelect";

it("updates the selected status inline and reports success", async () => {
  const provider = fakeRestDataProvider({
    romiku_quotes: [{ id: "q1", status: "draft" }],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <InlineStatusSelect
        resource="romiku_quotes"
        recordId="q1"
        status="draft"
        choices={[
          { value: "draft", label: "草稿" },
          { value: "sent", label: "已发送" },
        ]}
      />
    </CoreAdminContext>,
  );
  await screen.getByLabelText("状态 q1", { exact: true }).selectOptions("sent");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("状态已保存。");
  expect(
    (await provider.getOne("romiku_quotes", { id: "q1" })).data.status,
  ).toBe("sent");
});

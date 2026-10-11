import { render } from "vitest-browser-react";
import { CoreAdminContext, type AuthProvider } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { OwnerFilter, useOwnerFilter } from "./OwnerFilter";

it("resolves profile names without placeholders and keeps auth UUID filters", async () => {
  const provider = fakeRestDataProvider({
    sales: [
      { id: 1, user_id: "owner-a", first_name: "娜", last_name: "吴" },
      { id: 2, user_id: "owner-b", first_name: "杨锋", last_name: "" },
      {
        id: 3,
        user_id: "owner-missing",
        first_name: "Pending",
        last_name: "Pending",
        email: "hidden@example.com",
      },
    ],
  });
  const auth = {
    getIdentity: async () => ({ id: 2 }),
    checkAuth: async () => {},
    checkError: async () => {},
    login: async () => {},
    logout: async () => {},
  } as AuthProvider;
  function Harness() {
    const state = useOwnerFilter();
    return (
      <>
        <OwnerFilter state={state} />
        <output aria-label="filtered owner">{state.effectiveOwner}</output>
      </>
    );
  }
  const screen = await render(
    <CoreAdminContext dataProvider={provider} authProvider={auth}>
      <Harness />
    </CoreAdminContext>,
  );
  const selector = screen.getByLabelText("负责人", { exact: true });
  await expect.element(selector).toBeEnabled();
  await expect.element(selector).toHaveTextContent("吴娜");
  await expect.element(selector).toHaveTextContent("杨锋");
  await expect.element(selector).toHaveTextContent("未设置姓名");
  await expect.element(selector).not.toHaveTextContent("Pending");
  await expect.element(selector).not.toHaveTextContent("hidden@example.com");
  await selector.selectOptions("owner-a");
  await expect
    .element(screen.getByLabelText("filtered owner"))
    .toHaveTextContent("owner-a");
  await screen.getByLabelText("仅看我的", { exact: true }).click();
  await expect
    .element(screen.getByLabelText("filtered owner"))
    .toHaveTextContent("owner-b");
  await expect.element(selector).toBeDisabled();
  expect((await provider.getOne("sales", { id: 1 })).data.user_id).toBe(
    "owner-a",
  );
});

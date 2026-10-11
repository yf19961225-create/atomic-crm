import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { WorkflowPage, type WorkflowConfig } from "./WorkflowPage";
import { workflowResources } from "./workflow";
import { useHasAppDraft } from "../updates/drafts";
const Probe = () => (
  <output aria-label="draft state">{String(useHasAppDraft())}</output>
);
const config: WorkflowConfig = {
  kind: "customer",
  title: "Customers",
  createLabel: "Create customer",
  statuses: ["active"],
  fields: [
    { key: "name", label: "Editable name", required: true },
    { key: "notes", label: "Editable notes" },
  ],
};
it("workflow edits compare only editable fields and refetch does not replace a draft", async () => {
  const resource = workflowResources.customer;
  const record = {
    id: "1",
    name: "Original",
    status: "active",
    notes: null,
    updated_at: "old",
  };
  const provider = fakeRestDataProvider({
    [resource]: [record],
    sales: [],
    romiku_customer_contacts: [],
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const screen = await render(
    <MemoryRouter initialEntries={["/?record=1"]}>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <WorkflowPage config={config} />
        <Probe />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("textbox", { name: "Editable name" }))
    .toHaveValue("Original");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "Editable name" }).fill("Draft");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  cache.setQueryData([resource, "getOne", { id: "1" }], {
    ...record,
    updated_at: "new",
  });
  await expect
    .element(screen.getByRole("textbox", { name: "Editable name" }))
    .toHaveValue("Draft");
  await screen.getByRole("textbox", { name: "Editable name" }).fill("Original");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "Editable notes" }).fill("note");
  await screen.getByRole("textbox", { name: "Editable notes" }).fill("");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "Editable name" }).fill("Saved");
  await screen.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect.element(screen.getByText("记录已保存。")).toBeVisible();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});

it("workflow creation defaults and validation are clean, while reverting input clears the draft", async () => {
  const provider = fakeRestDataProvider({
    [workflowResources.customer]: [],
    sales: [],
  });
  const screen = await render(
    <MemoryRouter initialEntries={["/?record=new"]}>
      <CoreAdminContext dataProvider={provider}>
        <WorkflowPage config={config} />
        <Probe />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox", { name: "Editable name" }).fill("Draft");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("textbox", { name: "Editable name" }).fill("");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});

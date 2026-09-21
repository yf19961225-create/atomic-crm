import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { FormalCustomerSelector } from "./FormalCustomerSelector";

it("reads the searchable Formal Customer directory and snapshots only the chosen customer", async () => {
  const onSelect = vi.fn();
  const screen = await render(
    <CoreAdminContext
      dataProvider={fakeRestDataProvider({
        romiku_formal_customer_directory: [
          {
            id: "formal-1",
            name: "Formal buyer",
            brand: "ROMIKU Spain",
            contact: "Ana Buyer",
            country: "Spain",
            email: "ana@example.test",
            search_text: "formal buyer romiku spain ana buyer spain",
          },
        ],
      })}
    >
      <FormalCustomerSelector onSelect={onSelect} />
    </CoreAdminContext>,
  );

  await screen.getByLabelText("选择正式客户").selectOptions("formal-1");
  expect(onSelect).toHaveBeenLastCalledWith({
    formalCustomerId: "formal-1",
    snapshot: {
      name: "Formal buyer",
      brand: "ROMIKU Spain",
      contact: "Ana Buyer",
      country: "Spain",
      email: "ana@example.test",
    },
  });
  await screen.getByLabelText("搜索正式客户").fill("ana buyer");
});

import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "@vitest/browser/context";
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

  await screen.getByRole("combobox", { name: "正式客户" }).click();
  await screen.getByRole("option", { name: /Formal buyer/ }).click();
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
  await screen.getByRole("combobox", { name: "正式客户" }).fill("ana buyer");
});

it("uses one keyboard-searchable combobox with an explicit unlinked option", async () => {
  const onSelect = vi.fn();
  const screen = await render(
    <CoreAdminContext
      dataProvider={fakeRestDataProvider({
        romiku_formal_customer_directory: [
          {
            id: "formal-2",
            name: "Global Beauty",
            brand: "GB",
            contact: "Bea Buyer",
            country: "Canada",
            search_text: "global beauty gb bea buyer canada",
          },
        ],
      })}
    >
      <FormalCustomerSelector onSelect={onSelect} />
    </CoreAdminContext>,
  );

  const input = screen.getByRole("combobox", { name: "正式客户" });
  await input.fill("bea buyer");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(onSelect).toHaveBeenLastCalledWith({
    formalCustomerId: "formal-2",
    snapshot: {
      name: "Global Beauty",
      brand: "GB",
      contact: "Bea Buyer",
      country: "Canada",
    },
  });

  await input.fill("");
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenLastCalledWith({ formalCustomerId: null });
});

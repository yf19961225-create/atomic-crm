import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import { FormProvider, useForm } from "react-hook-form";
import { userEvent } from "vitest/browser";
import { SearchInput } from "./search-input";

function Fixture() {
  const form = useForm({ defaultValues: { q: "old" } });
  return (
    <CoreAdminContext>
      <FormProvider {...form}>
        <SearchInput source="q" />
        <output data-testid="committed">{form.watch("q")}</output>
      </FormProvider>
    </CoreAdminContext>
  );
}

it("stages legacy list search until Enter or button and clears immediately", async () => {
  const screen = await render(<Fixture />);
  const input = screen.getByRole("searchbox");
  await input.fill("B");
  await input.fill("BQ");
  await input.fill("BQV10");
  await expect
    .element(screen.getByTestId("committed"))
    .toHaveTextContent("old");
  await input.click();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByTestId("committed"))
    .toHaveTextContent("BQV10");
  await input.fill("SUN5");
  await screen.getByRole("button", { name: "ra.action.search" }).click();
  await expect
    .element(screen.getByTestId("committed"))
    .toHaveTextContent("SUN5");
  await screen.getByRole("button", { name: "清空" }).click();
  await expect.element(screen.getByTestId("committed")).toBeEmptyDOMElement();
});

import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { SearchInput } from "./SearchInput";

it("keeps typed text local until Enter or 搜索 and clears explicitly", async () => {
  const submit = vi.fn();
  const clear = vi.fn();
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <SearchInput
        value={value}
        onChange={setValue}
        onSubmit={submit}
        onClear={() => {
          setValue("");
          clear();
        }}
      />
    );
  }
  const screen = await render(<Harness />);
  const input = screen.getByRole("searchbox", { name: "搜索业务记录" });
  for (const text of ["B", "BQ", "BQV", "BQV10"]) await input.fill(text);
  expect(submit).not.toHaveBeenCalled();
  await input.click();
  await userEvent.keyboard("{Enter}");
  expect(submit).toHaveBeenCalledExactlyOnceWith("BQV10");
  await input.fill("SUN5");
  expect(submit).toHaveBeenCalledTimes(1);
  await screen.getByRole("button", { name: "搜索", exact: true }).click();
  expect(submit).toHaveBeenLastCalledWith("SUN5");
  await screen.getByRole("button", { name: "清空", exact: true }).click();
  expect(clear).toHaveBeenCalledTimes(1);
  await expect.element(input).toHaveValue("");
});

it("ignores Enter while Chinese input is composing", async () => {
  const submit = vi.fn();
  const screen = await render(
    <SearchInput
      value="中文"
      onChange={() => undefined}
      onSubmit={submit}
      onClear={() => undefined}
    />,
  );
  const input = screen.getByRole("searchbox", { name: "搜索业务记录" });
  input.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      isComposing: true,
    }),
  );
  expect(submit).not.toHaveBeenCalled();
  await input.click();
  await userEvent.keyboard("{Enter}");
  expect(submit).toHaveBeenCalledExactlyOnceWith("中文");
});

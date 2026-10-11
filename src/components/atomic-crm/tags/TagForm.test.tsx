import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { TagForm } from "./TagForm";
import { colors } from "./colors";
import { useHasAppDraft } from "@/components/romiku/updates/drafts";
const Probe = () => (
  <output aria-label="draft state">{String(useHasAppDraft())}</output>
);
const tag = { name: "Original", color: colors[0] };
const view = (
  onSubmit: (value: typeof tag) => Promise<void>,
  nextTag = tag,
  open = true,
) => (
  <>
    <TagForm open={open} tag={nextTag} onSubmit={onSubmit} />
    <Probe />
  </>
);
it("tag refetch preserves edits and a successful save sets a clean baseline", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  const screen = await render(view(submit));
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox").fill("Draft");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.rerender(view(submit, { ...tag }));
  await expect.element(screen.getByRole("textbox")).toHaveValue("Draft");
  await screen.getByRole("textbox").fill("Original");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByRole("textbox").fill("Saved");
  await screen.getByRole("button", { name: "ra.action.save" }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});
it("unchanged tag submission is clean while pending and closing discards a draft", async () => {
  let finish!: () => void;
  const submit = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(view(submit));
  await screen.getByRole("button", { name: "ra.action.save" }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  finish();
  await expect
    .element(screen.getByRole("button", { name: "ra.action.save" }))
    .toBeEnabled();
  await screen.getByRole("textbox").fill("Draft");
  await screen.rerender(view(submit, tag, false));
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.rerender(view(submit));
  await expect.element(screen.getByRole("textbox")).toHaveValue("Original");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});

it("tag save keeps newer edits dirty and treats submitted whitespace consistently", async () => {
  let finish!: () => void;
  const submit = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(view(submit));
  await screen.getByRole("textbox").fill(" Saved ");
  await screen.getByRole("button", { name: "ra.action.save" }).click();
  await screen.getByRole("textbox").fill("Newer");
  await screen.rerender(view(submit, { ...tag, name: "Server refetch" }));
  await expect.element(screen.getByRole("textbox")).toHaveValue("Newer");
  finish();
  await expect
    .element(screen.getByRole("button", { name: "ra.action.save" }))
    .toBeEnabled();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByRole("textbox").fill("Saved");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
});

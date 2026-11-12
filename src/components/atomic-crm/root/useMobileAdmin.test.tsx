import { useState } from "react";
import { render } from "vitest-browser-react";
import { afterEach, expect, it, vi } from "vitest";
import { useAppDraft } from "@/components/romiku/updates/drafts";
import { useMobileAdmin } from "./useMobileAdmin";

function Editor({ label }: { label: string }) {
  const [value, setValue] = useState("");
  useAppDraft(Boolean(value));
  return (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

function Fixture() {
  const label = useMobileAdmin() ? "mobile" : "desktop";
  return <Editor key={label} label={label} />;
}

const originalUrl = window.location.href;
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(window.history.state, "", originalUrl);
});

function viewport(path: string, initial: boolean) {
  window.history.replaceState(window.history.state, "", `#${path}`);
  const media = Object.assign(new EventTarget(), { matches: initial });
  vi.spyOn(window, "matchMedia").mockReturnValue(media as MediaQueryList);
  return (mobile: boolean) => {
    media.matches = mobile;
    media.dispatchEvent(new Event("change"));
  };
}

it.each([
  ["/quotes/q", false],
  ["/pi/new", true],
  ["/orders/o", false],
  ["/production/p", true],
  ["/packing-shipping/p?tab=items", false],
] as const)(
  "preserves a dirty %s editor and adopts the pending viewport after clearing",
  async (path, initial) => {
    const resize = viewport(path, initial);
    const screen = await render(<Fixture />);
    const label = initial ? "mobile" : "desktop";
    const next = initial ? "desktop" : "mobile";
    const editor = screen.getByLabelText(label);
    const element = editor.element();
    await editor.fill("unsaved");
    resize(!initial);
    await expect.element(editor).toHaveValue("unsaved");
    expect(editor.element()).toBe(element);
    await editor.fill("");
    await expect.element(screen.getByLabelText(next)).toBeVisible();
  },
);

it("renders the matching mobile shell initially and resizes a clean editor", async () => {
  const resize = viewport("/orders/o", true);
  const screen = await render(<Fixture />);
  await expect.element(screen.getByLabelText("mobile")).toBeVisible();
  resize(false);
  await expect.element(screen.getByLabelText("desktop")).toBeVisible();
});

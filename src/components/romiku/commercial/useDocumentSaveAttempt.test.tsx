import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { useDocumentSaveAttempt } from "./useDocumentSaveAttempt";

it("synchronously rejects duplicate entry and keeps an uncertain attempt locked", async () => {
  let starts = 0;
  function Fixture() {
    const attempt = useDocumentSaveAttempt();
    return (
      <>
        <button
          onClick={() => {
            if (attempt.begin()) starts++;
          }}
        >
          Start
        </button>
        <button onClick={attempt.fail}>Fail</button>
        <button onClick={attempt.succeed}>Success</button>
        <p>{attempt.needsReconciliation ? "Check server" : "Ready"}</p>
      </>
    );
  }
  const screen = await render(<Fixture />);
  const start = screen
    .getByRole("button", { name: "Start" })
    .element() as HTMLButtonElement;
  start.click();
  start.click();
  expect(starts).toBe(1);
  await screen.getByRole("button", { name: "Success" }).click();
  start.click();
  expect(starts).toBe(2);
  await screen.getByRole("button", { name: "Fail" }).click();
  await expect.element(screen.getByText("Check server")).toBeVisible();
  start.click();
  expect(starts).toBe(2);
});

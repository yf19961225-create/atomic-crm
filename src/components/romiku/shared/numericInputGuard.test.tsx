import { afterEach, describe, expect, it } from "vitest";
import { installNumericInputWheelGuard } from "./numericInputGuard";

describe("numeric input wheel guard", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("blurs focused number inputs without cancelling page wheel scrolling", () => {
    const number = document.createElement("input");
    number.type = "number";
    number.value = "12.5";
    const next = document.createElement("input");
    document.body.append(number, next);
    const cleanup = installNumericInputWheelGuard(document);
    number.focus();
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    number.dispatchEvent(wheel);
    expect(number.value).toBe("12.5");
    expect(document.activeElement).not.toBe(number);
    expect(wheel.defaultPrevented).toBe(false);
    cleanup();
  });

  it("does not interfere with decimals, tab, enter, or validation", () => {
    const number = document.createElement("input");
    number.type = "number";
    number.step = "any";
    number.required = true;
    const next = document.createElement("input");
    document.body.append(number, next);
    const cleanup = installNumericInputWheelGuard(document);
    number.value = "12.5";
    expect(number.checkValidity()).toBe(true);
    let entered = false;
    number.addEventListener("keydown", (event) => {
      entered = event.key === "Enter";
    });
    number.focus();
    number.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(entered).toBe(true);
    number.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(number.value).toBe("12.5");
    cleanup();
  });
});

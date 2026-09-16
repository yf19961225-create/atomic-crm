import { describe, expect, it } from "vitest";
import { romikuResources } from "./resources";

describe("ROMIKU resource injection", () => {
  it("exports resources separately from the Atomic CRM shell", () => {
    expect(romikuResources).toBeTruthy();
  });
});

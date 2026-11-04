import { describe, expect, it } from "vitest";
import { mayEditFactoryDue, productionHeaderForMode } from "./rollbackPolicy";
describe("safe rollback", () => {
  it("blocks date editing of existing production but preserves initial creation", () => {
    expect(mayEditFactoryDue(true, false)).toBe(false);
    expect(mayEditFactoryDue(true, true)).toBe(true);
    expect(mayEditFactoryDue(false, false)).toBe(false);
  });
  it("does not send a stale date in an ordinary rollback save", () => {
    const header = { notes: "keep", factory_due_at: "old" };
    expect(productionHeaderForMode(header, true, false)).toEqual({
      notes: "keep",
    });
    expect(productionHeaderForMode(header, true, true)).toEqual(header);
    expect(productionHeaderForMode(header, false, false)).toEqual({
      notes: "keep",
    });
    expect(header.factory_due_at).toBe("old");
  });
});

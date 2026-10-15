import { expect, it } from "vitest";
import {
  productionDueDateInput,
  productionDueDateLabel,
  productionDueDatePayload,
} from "./productionDueDate";
import { productionDraftSnapshot } from "./productionDraftSnapshot";

it("keeps a factory due date as the same China calendar day across storage and display", () => {
  const stored = productionDueDatePayload("2026-10-25");
  expect(stored).toBe("2026-10-25T15:59:59.999Z");
  expect(productionDueDateInput(stored)).toBe("2026-10-25");
  expect(productionDueDateLabel(stored)).toBe("2026年10月25日");
  expect(productionDueDateInput("2026-10-24T16:00:00Z")).toBe("2026-10-25");
});

it("allows an unknown date and rejects malformed calendar dates before the RPC", () => {
  expect(productionDueDatePayload("")).toBeNull();
  expect(productionDueDateLabel(null)).toBe("—");
  expect(() => productionDueDatePayload("10")).toThrow(
    "工厂交期格式无效，请重新选择日期。",
  );
  expect(() => productionDueDatePayload("2026-02-30")).toThrow(
    "工厂交期格式无效，请重新选择日期。",
  );
});

it("treats a stored timestamp and its calendar date as the same clean draft", () => {
  expect(
    productionDraftSnapshot(
      { id: "p", factory_due_at: "2026-10-25T15:59:59.999Z" },
      [],
    ),
  ).toBe(
    productionDraftSnapshot({ id: "p", factory_due_at: "2026-10-25" }, []),
  );
});

import { expect, it } from "vitest";
import {
  calendarEventLabel,
  priorityLabel,
  relationshipStatusLabel,
  taskSourceLabel,
} from "./relationshipLabels";

it("renders relationship workflow identifiers as Chinese labels without changing stored values", () => {
  expect(relationshipStatusLabel("to_develop")).toBe("待开发");
  expect(relationshipStatusLabel("following_up")).toBe("跟进中");
  expect(priorityLabel("urgent")).toBe("紧急");
  expect(calendarEventLabel("outbound_follow_up")).toBe("外贸开发跟进");
  expect(calendarEventLabel("quote_due")).toBe("报价单到期");
  expect(taskSourceLabel("outbound_company_id")).toBe("外贸开发公司");
});

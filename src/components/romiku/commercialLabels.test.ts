import { expect, it } from "vitest";
import {
  documentStatusChoices,
  documentStatusLabel,
  paymentKindChoices,
  paymentKindLabel,
  productionStatusChoices,
  productionStatusLabel,
  quoteStatusChoices,
  quoteStatusLabel,
  supplierStatusChoices,
  supplierStatusLabel,
} from "./commercialLabels";

it("maps stored commercial enum identifiers to Chinese display labels without changing their values", () => {
  expect(quoteStatusLabel("quoted")).toBe("已报价");
  expect(documentStatusLabel("ready_to_ship")).toBe("待发运");
  expect(paymentKindLabel("deposit")).toBe("定金");
  expect(productionStatusLabel("scheduled")).toBe("已排产");
  expect(supplierStatusLabel("paused")).toBe("暂停");

  expect(quoteStatusChoices).toContainEqual({ id: "quoted", label: "已报价" });
  expect(documentStatusChoices).toContainEqual({
    id: "ready_to_ship",
    label: "待发运",
  });
  expect(paymentKindChoices).toContainEqual({ id: "deposit", label: "定金" });
  expect(productionStatusChoices).toContainEqual({
    id: "scheduled",
    label: "已排产",
  });
  expect(supplierStatusChoices).toContainEqual({ id: "paused", name: "暂停" });
});

it("exposes exactly the final six Quote statuses", () => {
  expect(quoteStatusChoices).toEqual([
    { id: "pending_quote", label: "待报价" },
    { id: "quoted", label: "已报价" },
    { id: "following_up", label: "跟进中" },
    { id: "customer_no_reply", label: "客户未回复" },
    { id: "won", label: "已成交" },
    { id: "invalid", label: "无效" },
  ]);
});

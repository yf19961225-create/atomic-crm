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
  expect(quoteStatusLabel("sent")).toBe("已发送");
  expect(documentStatusLabel("ready_to_ship")).toBe("待发运");
  expect(paymentKindLabel("deposit")).toBe("定金");
  expect(productionStatusLabel("in_production")).toBe("生产中");
  expect(supplierStatusLabel("paused")).toBe("暂停");

  expect(quoteStatusChoices).toContainEqual({ id: "sent", label: "已发送" });
  expect(documentStatusChoices).toContainEqual({
    id: "ready_to_ship",
    label: "待发运",
  });
  expect(paymentKindChoices).toContainEqual({ id: "deposit", label: "定金" });
  expect(productionStatusChoices).toContainEqual({
    id: "in_production",
    label: "生产中",
  });
  expect(supplierStatusChoices).toContainEqual({ id: "paused", name: "暂停" });
});

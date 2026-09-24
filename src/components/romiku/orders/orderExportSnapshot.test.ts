import { expect, it } from "vitest";
import {
  defaultOrderExportSnapshot,
  orderExportSnapshot,
} from "./orderExportSnapshot";

it("initializes the eight Order Terms from the fixed workbook defaults", () => {
  const terms = defaultOrderExportSnapshot().terms;
  expect(terms.payment).toEqual({
    visible: true,
    text: "30% deposit by T/T in advance; the remaining 70% to be paid in full within 7 days of receiving notification that the goods are ready for dispatch and prior to shipment\n预付 30% 电汇（T/T）定金；在收到货物已准备好发运的通知后 7 天内，且在出运前，付清其余 70% 的尾款。",
  });
  expect(terms.bank_charges.text).toBe(
    "All bank charges outside China shall be borne by the Buyer.\n所有境外银行费用由买方承担。",
  );
  expect(terms.cancellation_deposit.text).toBe(
    "If the order is cancelled or abandoned due to the Buyer's reasons, the 30% deposit is non-refundable and shall be forfeited as compensation for materials and labor.\n若因买方原因取消或放弃订单，30% 的定金将不予退还，并作为材料和人工损失的补偿金予以没收。",
  );
  expect(terms.quality_claim.text).toBe(
    "Any quality claim shall be raised within 30 days after arrival of goods at destination.\n货物到达目的港后30天内提出质量异议。",
  );
  expect(terms.force_majeure.text).toBe(
    "Seller shall not be liable for any delay or failure in performance due to force majeure.\n因不可抗力导致的延迟或无法履行，卖方不承担责任。",
  );
  expect(terms.dispute_settlement.text).toBe(
    "Any dispute arising from this contract shall be settled through friendly negotiation.\n因本合同产生的任何争议，双方应友好协商解决。",
  );
  expect(terms.delivery_lead_time.text).toBe(
    "Delivery lead time: 7-10 days after receiving deposit, subject to stock availability.\n收到定金后 7-10 天，具体视库存情况而定。",
  );
  expect(terms.packaging.text).toBe(
    "Standard export packaging, securely packed in sturdy outer cartons.\n标准出口包装，安全牢固地包装在坚固的外纸箱内。",
  );
});

it("keeps a saved Order-level Term override without changing defaults", () => {
  expect(
    orderExportSnapshot({
      order_export: { terms: { quality_claim: { text: "Saved override" } } },
    }).terms.quality_claim.text,
  ).toBe("Saved override");
  expect(defaultOrderExportSnapshot().terms.quality_claim.text).toContain(
    "30 days",
  );
});

export const workflowStatusLabels = {
  quote: { pending_quote: "待报价", sent: "已发送", won: "已成交" },
  pi: {
    draft: "待制作",
    sent: "已发送",
    confirmed: "已确认",
    cancelled: "已取消",
  },
  order: {
    draft: "草稿",
    confirmed: "已确认",
    in_production: "生产中",
    ready_to_ship: "待发运",
    shipped: "已发运",
    completed: "已完成",
    cancelled: "已取消",
    voided: "已作废",
  },
  production: {
    pending_send: "待发送",
    scheduled: "已排产",
    received: "已收货",
    cancelled: "已取消",
  },
  packing: {
    draft: "待制作",
    incomplete: "信息不全",
    completed: "已完成",
    sent: "已发送",
  },
  website_inquiry: {
    pending_screening: "待筛选",
    pending_contact: "待联系",
    pending_quote: "待报价",
    quoted: "已报价",
    following_up: "跟进中",
    customer_no_reply: "客户未回复",
    won: "已成交",
    invalid: "无效",
  },
  outbound: {
    to_develop: "待开发",
    contacted: "已联系",
    no_reply: "未回复",
    replied: "已回复",
    communicating: "沟通中",
    purchase_intent: "有采购意向",
    to_quote: "待报价",
    quoted: "已报价",
    sampling: "打样中",
    paused: "暂停",
    invalid: "无效",
  },
};
export type WorkflowResource = keyof typeof workflowStatusLabels;
export const statusOptions = (kind: WorkflowResource) =>
  Object.entries(workflowStatusLabels[kind]).map(([value, label]) => ({
    value,
    label,
  }));
export const statusLabel = (kind: string, value: unknown) =>
  (
    workflowStatusLabels[kind as WorkflowResource] as
      | Record<string, string>
      | undefined
  )?.[String(value)] || String(value ?? "—");

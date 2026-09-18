type DisplayLabels = Record<string, string>;

const workflowChoicesFor = (labels: DisplayLabels) =>
  Object.entries(labels).map(([id, label]) => ({ id, label }));
const selectChoicesFor = (labels: DisplayLabels) =>
  Object.entries(labels).map(([id, name]) => ({ id, name }));

const labelFor = (labels: DisplayLabels, value: unknown) =>
  labels[String(value)] ?? String(value ?? "");

export const quoteStatusLabels = {
  draft: "草稿",
  sent: "已发送",
  accepted: "已接受",
  declined: "已拒绝",
  expired: "已过期",
  cancelled: "已取消",
};
export const quoteStatusChoices = workflowChoicesFor(quoteStatusLabels);
export const quoteStatusLabel = (value: unknown) =>
  labelFor(quoteStatusLabels, value);

export const documentStatusLabels = {
  draft: "草稿",
  sent: "已发送",
  confirmed: "已确认",
  in_production: "生产中",
  ready_to_ship: "待发运",
  shipped: "已发运",
  completed: "已完成",
  cancelled: "已取消",
};
export const documentStatusChoices = workflowChoicesFor(documentStatusLabels);
export const documentStatusLabel = (value: unknown) =>
  labelFor(documentStatusLabels, value);

export const paymentKindLabels = {
  deposit: "定金",
  balance: "尾款",
  other: "其他",
};
export const paymentKindChoices = workflowChoicesFor(paymentKindLabels);
export const paymentKindLabel = (value: unknown) =>
  labelFor(paymentKindLabels, value);

export const productionStatusLabels = {
  pending: "待生产",
  in_production: "生产中",
  completed: "已完成",
  received: "已收货",
  cancelled: "已取消",
};
export const productionStatusChoices = workflowChoicesFor(
  productionStatusLabels,
);
export const productionStatusLabel = (value: unknown) =>
  labelFor(productionStatusLabels, value);

export const supplierStatusLabels = {
  active: "启用",
  paused: "暂停",
  inactive: "停用",
};
export const supplierStatusChoices = selectChoicesFor(supplierStatusLabels);
export const supplierStatusLabel = (value: unknown) =>
  labelFor(supplierStatusLabels, value);

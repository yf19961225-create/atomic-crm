import { workflowStatusLabels } from "./shared/workflowStatus";
type DisplayLabels = Record<string, string>;

const workflowChoicesFor = (labels: DisplayLabels) =>
  Object.entries(labels).map(([id, label]) => ({ id, label }));
const selectChoicesFor = (labels: DisplayLabels) =>
  Object.entries(labels).map(([id, name]) => ({ id, name }));

const labelFor = (labels: DisplayLabels, value: unknown) =>
  labels[String(value)] ?? String(value ?? "");

export const quoteStatusLabels = workflowStatusLabels.quote;
export const quoteStatusChoices = workflowChoicesFor(quoteStatusLabels);
export const quoteStatusLabel = (value: unknown) =>
  labelFor(quoteStatusLabels, value);

export const documentStatusLabels = {
  ...workflowStatusLabels.order,
  // Generic document/workbench draft must not rename PI or packing drafts.
  draft: "草稿",
  sent: "已发送",
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

export const productionStatusLabels = workflowStatusLabels.production;
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

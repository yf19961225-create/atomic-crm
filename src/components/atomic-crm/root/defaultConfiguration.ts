import type { ConfigurationContextValue } from "./ConfigurationContext";
// Import the logos as module assets so Vite resolves their URL relative to the
// JS chunk (import.meta.url), not the current route. A plain "./logos/..." path
// breaks on nested routes like /oauth/consent and under a deployment sub-path.
import darkModeLogo from "./logos/logo_atomic_crm_dark.svg";
import lightModeLogo from "./logos/logo_atomic_crm_light.svg";

export const defaultDarkModeLogo = darkModeLogo;
export const defaultLightModeLogo = lightModeLogo;

export const defaultCurrency = "USD";

export const defaultTitle = "Atomic CRM";

export const defaultCompanySectors = [
  { value: "communication-services", label: "通信服务" },
  { value: "consumer-discretionary", label: "可选消费" },
  { value: "consumer-staples", label: "必选消费" },
  { value: "energy", label: "能源" },
  { value: "financials", label: "金融" },
  { value: "health-care", label: "医疗健康" },
  { value: "industrials", label: "工业" },
  { value: "information-technology", label: "信息技术" },
  { value: "materials", label: "材料" },
  { value: "real-estate", label: "房地产" },
  { value: "utilities", label: "公用事业" },
];

export const defaultDealStages = [
  { value: "opportunity", label: "商机" },
  { value: "proposal-sent", label: "已发送方案" },
  { value: "in-negociation", label: "谈判中" },
  { value: "won", label: "已成交" },
  { value: "lost", label: "已失单" },
  { value: "delayed", label: "已延期" },
];

export const defaultDealPipelineStatuses = ["won"];

export const defaultDealCategories = [
  { value: "other", label: "其他" },
  { value: "copywriting", label: "文案服务" },
  { value: "print-project", label: "印刷项目" },
  { value: "ui-design", label: "界面设计" },
  { value: "website-design", label: "网站设计" },
];

export const defaultNoteStatuses = [
  { value: "cold", label: "冷", color: "#7dbde8" },
  { value: "warm", label: "温", color: "#e8cb7d" },
  { value: "hot", label: "热", color: "#e88b7d" },
  { value: "in-contract", label: "合同中", color: "#a4e87d" },
];

export const defaultTaskTypes = [
  { value: "none", label: "无" },
  { value: "email", label: "电子邮件" },
  { value: "demo", label: "演示" },
  { value: "lunch", label: "午餐" },
  { value: "meeting", label: "会议" },
  { value: "follow-up", label: "跟进" },
  { value: "thank-you", label: "致谢" },
  { value: "ship", label: "发运" },
  { value: "call", label: "电话" },
];

export const defaultConfiguration: ConfigurationContextValue = {
  companySectors: defaultCompanySectors,
  currency: defaultCurrency,
  dealCategories: defaultDealCategories,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealStages: defaultDealStages,
  noteStatuses: defaultNoteStatuses,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};

const labels: Record<string, string> = {
  accepted: "已接受",
  active: "启用",
  cancelled: "已取消",
  completed: "已完成",
  confirmed: "已确认",
  contacted: "已联系",
  communicating: "沟通中",
  decision_maker: "决策人",
  directory: "目录",
  draft: "草稿",
  expired: "已过期",
  exhibition: "展会",
  following_up: "跟进中",
  high: "高",
  inactive: "停用",
  in_production: "生产中",
  invalid: "无效",
  low: "低",
  new: "新建",
  not_found: "未匹配",
  no_reply: "未回复",
  normal: "普通",
  other: "其他",
  owner: "负责人",
  paused: "暂停",
  pending: "待处理",
  processed: "已处理",
  purchase_intent: "有采购意向",
  purchasing_assistant: "采购助理",
  quoted: "已报价",
  ready_to_ship: "待发运",
  received: "已收货",
  replied: "已回复",
  sampling: "打样中",
  sent: "已发送",
  shipped: "已发运",
  scheduled: "已排期",
  social: "社交媒体",
  to_develop: "待开发",
  to_quote: "待报价",
  urgent: "紧急",
  website: "网站",
  customs: "海关",
};

const calendarEventLabels: Record<string, string> = {
  inquiry_follow_up: "网站询盘跟进",
  outbound_follow_up: "外贸开发跟进",
  quote_follow_up: "报价单跟进",
  quote_due: "报价单到期",
  pi_follow_up: "形式发票跟进",
  pi_due: "形式发票到期",
  order_delivery: "订单交付",
  production_anomaly: "生产异常",
  production_due: "生产到期",
  packing_date: "装箱日期",
  packing: "装箱／发运",
  manual_task: "手动任务",
};

const taskSourceLabels: Record<string, string> = {
  outbound_company_id: "外贸开发公司",
  formal_customer_id: "正式客户",
  quote_id: "报价单",
  pi_id: "形式发票",
  order_id: "订单",
  production_order_id: "生产单",
  supplier_id: "供应商",
};

export const relationshipStatusLabel = (value: unknown) =>
  labels[String(value)] ?? String(value ?? "").replaceAll("_", " ");

export const priorityLabel = (value: unknown) => relationshipStatusLabel(value);

export const calendarEventLabel = (value: unknown) =>
  calendarEventLabels[String(value)] ?? relationshipStatusLabel(value);

export const taskSourceLabel = (value: unknown) =>
  taskSourceLabels[String(value)] ?? relationshipStatusLabel(value);

export const followupMethodLabel = (value: unknown) =>
  ({
    WhatsApp: "WhatsApp",
    Email: "电子邮件",
    Phone: "电话",
    Instagram: "Instagram",
    Facebook: "Facebook",
    LinkedIn: "LinkedIn",
    Other: "其他",
  })[String(value)] ?? String(value ?? "");

export const inquiryFieldLabel = (value: string) =>
  ({
    document_number: "询盘编号",
    customer_name: "客户名称",
    company: "公司名称",
    email: "电子邮箱",
    whatsapp: "WhatsApp",
    country: "国家／地区",
    message: "留言内容",
  })[value] ?? value.replaceAll("_", " ");

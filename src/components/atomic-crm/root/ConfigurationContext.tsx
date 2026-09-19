import { useMemo } from "react";
import { useStore } from "ra-core";

import type { DealStage, LabeledValue, NoteStatus } from "../types";
import { defaultConfiguration } from "./defaultConfiguration";

export const CONFIGURATION_STORE_KEY = "app.configuration";

export interface ConfigurationContextValue {
  companySectors: LabeledValue[];
  currency: string;
  dealCategories: LabeledValue[];
  dealPipelineStatuses: string[];
  dealStages: DealStage[];
  noteStatuses: NoteStatus[];
  taskTypes: LabeledValue[];
  title: string;
  darkModeLogo: string;
  lightModeLogo: string;
}

const chineseLabels: Record<string, string> = {
  "communication-services": "通信服务",
  "consumer-discretionary": "可选消费",
  "consumer-staples": "日常消费",
  energy: "能源",
  financials: "金融",
  "health-care": "医疗保健",
  industrials: "工业",
  "information-technology": "信息技术",
  materials: "原材料",
  "real-estate": "房地产",
  utilities: "公用事业",
  opportunity: "商机",
  "proposal-sent": "已发送方案",
  "in-negociation": "谈判中",
  won: "已成交",
  lost: "已失单",
  delayed: "已延期",
  other: "其他",
  copywriting: "文案服务",
  "print-project": "印刷项目",
  "ui-design": "界面设计",
  "website-design": "网站设计",
  cold: "冷",
  warm: "温",
  hot: "热",
  "in-contract": "合同中",
  none: "无",
  email: "电子邮件",
  demo: "演示",
  lunch: "午餐",
  meeting: "会议",
  "follow-up": "跟进",
  "thank-you": "致谢",
  ship: "发运",
  call: "电话",
};

const legacyLabels = Object.fromEntries(
  [
    ...defaultConfiguration.companySectors,
    ...defaultConfiguration.dealCategories,
    ...defaultConfiguration.dealStages,
    ...defaultConfiguration.noteStatuses,
    ...defaultConfiguration.taskTypes,
  ].map(({ value, label }) => [value, label]),
);

const display = <T extends { value: string; label: string }>(items: T[]) =>
  items.map((item) => ({
    ...item,
    label:
      item.label === legacyLabels[item.value]
        ? (chineseLabels[item.value] ?? item.label)
        : item.label,
  }));

const raw = <T extends { value: string; label: string }>(items: T[]) =>
  items.map((item) => ({
    ...item,
    label:
      item.label === chineseLabels[item.value]
        ? (legacyLabels[item.value] ?? item.label)
        : item.label,
  }));

/**
 * Converts only the built-in Chinese display labels back to their historical
 * labels before configuration is stored. Custom labels are left untouched.
 */
export const restoreLegacyConfigurationLabels = (
  config: ConfigurationContextValue,
): ConfigurationContextValue => ({
  ...config,
  companySectors: raw(config.companySectors),
  dealCategories: raw(config.dealCategories),
  dealStages: raw(config.dealStages),
  noteStatuses: raw(config.noteStatuses),
  taskTypes: raw(config.taskTypes),
});

/** Converts built-in historical labels to their Chinese UI display labels. */
export const displayConfigurationLabels = (
  config: ConfigurationContextValue,
): ConfigurationContextValue => ({
  ...config,
  companySectors: display(config.companySectors),
  dealCategories: display(config.dealCategories),
  dealStages: display(config.dealStages),
  noteStatuses: display(config.noteStatuses),
  taskTypes: display(config.taskTypes),
});

export const useRawConfigurationContext = () => {
  const [config] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
    defaultConfiguration,
  );
  // Merge with defaults so that missing fields in stored config
  // fall back to default values (e.g. when new settings are added)
  return useMemo(() => ({ ...defaultConfiguration, ...config }), [config]);
};

export const useConfigurationContext = () => {
  const config = useRawConfigurationContext();
  return useMemo(() => displayConfigurationLabels(config), [config]);
};

export const useConfigurationUpdater = () => {
  const [, setConfig] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
  );
  return setConfig;
};

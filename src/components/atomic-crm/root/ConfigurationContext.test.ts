import { describe, expect, it } from "vitest";

import { defaultConfiguration } from "./defaultConfiguration";
import {
  displayConfigurationLabels,
  restoreLegacyConfigurationLabels,
} from "./ConfigurationContext";

describe("restoreLegacyConfigurationLabels", () => {
  it("restores historical labels after the settings form displays defaults in Chinese", () => {
    const config = restoreLegacyConfigurationLabels({
      ...defaultConfiguration,
      companySectors: [{ value: "information-technology", label: "信息技术" }],
      dealCategories: [{ value: "website-design", label: "网站设计" }],
      dealStages: [{ value: "proposal-sent", label: "已发送方案" }],
      noteStatuses: [{ value: "warm", label: "温", color: "#e8cb7d" }],
      taskTypes: [{ value: "call", label: "电话" }],
    });

    expect(config.companySectors[0].label).toBe("Information Technology");
    expect(config.dealCategories[0].label).toBe("Website design");
    expect(config.dealStages[0].label).toBe("Proposal Sent");
    expect(config.noteStatuses[0].label).toBe("Warm");
    expect(config.taskTypes[0].label).toBe("Call");
  });

  it("does not overwrite a custom configuration label", () => {
    const config = restoreLegacyConfigurationLabels({
      ...defaultConfiguration,
      dealStages: [{ value: "opportunity", label: "首次商机" }],
    });

    expect(config.dealStages[0].label).toBe("首次商机");
  });

  it("uses Chinese display labels when settings restores defaults", () => {
    const config = displayConfigurationLabels(defaultConfiguration);

    expect(config.companySectors[0].label).toBe("通信服务");
    expect(config.dealCategories[0].label).toBe("其他");
    expect(config.dealStages[0].label).toBe("商机");
    expect(config.noteStatuses[0].label).toBe("冷");
    expect(config.taskTypes[0].label).toBe("无");
  });
});

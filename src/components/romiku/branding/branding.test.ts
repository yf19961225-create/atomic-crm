import { describe, expect, it } from "vitest";
import { romikuBrand } from "./brand";
import { romikuI18nProvider } from "./i18nProvider";
import { applyRomikuBrand } from "./configuration";

describe("ROMIKU product shell", () => {
  it("uses the official brand name and route-safe wordmark assets", () => {
    expect(romikuBrand.title).toBe("ROMIKU CRM 2.0");
    expect(romikuBrand.darkModeLogo).toMatch(/romiku-wordmark/);
    expect(romikuBrand.lightModeLogo).toMatch(/romiku-wordmark/);
    expect(romikuBrand.darkModeLogo).toContain("fill='%23ffffff'");
    expect(romikuBrand.darkModeLogo).toContain("href='/romiku-wordmark.png'");
  });

  it("keeps ROMIKU presentation when an existing server configuration loads", () => {
    expect(
      applyRomikuBrand({
        title: "Atomic CRM",
        darkModeLogo: "atomic-dark.svg",
        lightModeLogo: "atomic-light.svg",
      }),
    ).toMatchObject({
      title: "ROMIKU CRM 2.0",
      darkModeLogo: romikuBrand.darkModeLogo,
      lightModeLogo: romikuBrand.lightModeLogo,
    });
  });

  it("defaults every CRM session to Simplified Chinese", () => {
    expect(romikuI18nProvider.getLocale()).toBe("zh-CN");
    expect(romikuI18nProvider.getLocales?.()).toEqual([
      { locale: "zh-CN", name: "简体中文" },
    ]);
  });

  it("translates authentication, generic CRUD, and CRM resource copy", () => {
    expect(romikuI18nProvider.translate("ra.auth.sign_in")).toBe("登录");
    expect(romikuI18nProvider.translate("ra.action.create")).toBe("新建");
    expect(romikuI18nProvider.translate("resources.contacts.name")).toBe(
      "联系人",
    );
    expect(romikuI18nProvider.translate("crm.auth.welcome_title")).toBe(
      "欢迎使用 ROMIKU CRM 2.0",
    );
  });
});

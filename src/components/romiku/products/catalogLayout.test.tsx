import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import designSystem from "../../../design-system.css?raw";

it("keeps offscreen accessible catalog labels inside the mobile table scrollport", async () => {
  await page.viewport(390, 900);
  const oldMargin = document.body.style.margin;
  document.body.style.margin = "0";
  const screen = await render(
    <div className="romiku-ds" style={{ width: "100%" }}>
      <style>{designSystem}</style>
      <div className="ds-catalog ds-table-scroll">
        <table style={{ tableLayout: "fixed", width: 1080 }}>
          <tbody>
            <tr>
              <td style={{ width: 730 }}>SKU</td>
              <td>
                <button>编辑</button>
                <span
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    whiteSpace: "nowrap",
                  }}
                >
                  编辑采购信息
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>,
  );
  try {
    const scrollport = document.querySelector<HTMLElement>(".ds-catalog")!;
    expect(scrollport.scrollWidth).toBeGreaterThan(scrollport.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    scrollport.scrollLeft = 500;
    expect(scrollport.scrollLeft).toBeGreaterThan(0);
    await expect.element(screen.getByText("编辑采购信息")).toBeInTheDocument();
  } finally {
    await screen.unmount();
    document.body.style.margin = oldMargin;
    await page.viewport(1440, 900);
  }
});

it("allows a fieldset with a wide product table to shrink to the mobile form", async () => {
  await page.viewport(390, 900);
  const screen = await render(
    <div className="romiku-ds" style={{ width: 358 }}>
      <style>{designSystem}</style>
      <fieldset>
        <section>统一生产要求</section>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 760 }}>
            <tbody>
              <tr>
                <td>生产产品明细</td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>,
  );
  try {
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    expect(
      document.querySelector("fieldset")!.getBoundingClientRect().width,
    ).toBeLessThanOrEqual(358);
  } finally {
    await screen.unmount();
    await page.viewport(1440, 900);
  }
});

import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SanityProductLookup } from "./SanityProductLookup";
import type { SanityProductSource } from "./sanityProductSource";

const source = (
  findBySku: SanityProductSource["findBySku"],
): SanityProductSource => ({
  initialState: { status: "loading" },
  findBySku,
});

describe("SanityProductLookup", () => {
  it("presents Sanity lookup controls and states in Simplified Chinese", async () => {
    const screen = await render(
      <SanityProductLookup
        sku="UNKNOWN"
        source={source(async (sku) => ({ status: "unmatched", sku }))}
        onMatched={vi.fn()}
      />,
    );

    await screen.getByRole("button", { name: "查询 SKU" }).click();
    await expect
      .element(screen.getByText("未在 Sanity 中找到匹配的 SKU。"))
      .toBeVisible();
  });

  it("shows loading, then matched data and only then offers a configured ID", async () => {
    let resolve!: (
      value: Awaited<ReturnType<SanityProductSource["findBySku"]>>,
    ) => void;
    const lookup = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<SanityProductSource["findBySku"]>>>(
          (r) => {
            resolve = r;
          },
        ),
    );
    const onMatched = vi.fn();
    const screen = await render(
      <SanityProductLookup
        sku="RMK-100"
        source={source(lookup)}
        onMatched={onMatched}
      />,
    );

    await screen.getByRole("button", { name: "查询 SKU" }).click();
    await expect
      .element(screen.getByText("正在 Sanity 中查询 SKU…"))
      .toBeVisible();
    resolve({
      status: "matched",
      product: {
        sanityProductId: "sanity-1",
        sku: "RMK-100",
        title: "Travel mug",
      },
    });
    await expect
      .element(screen.getByText("Travel mug (RMK-100)"))
      .toBeVisible();
    expect(onMatched).toHaveBeenCalledWith("sanity-1");
  });

  it("renders unmatched and error states without inventing a Sanity ID", async () => {
    const unmatched = await render(
      <SanityProductLookup
        sku="UNKNOWN"
        source={source(async (sku) => ({ status: "unmatched", sku }))}
        onMatched={vi.fn()}
      />,
    );
    await unmatched.getByRole("button", { name: "查询 SKU" }).click();
    await expect
      .element(unmatched.getByText("未在 Sanity 中找到匹配的 SKU。"))
      .toBeVisible();

    const error = await render(
      <SanityProductLookup
        sku="RMK-100"
        source={source(async (sku) => ({
          status: "error",
          sku,
          message: "Sanity 产品查询失败。",
        }))}
        onMatched={vi.fn()}
      />,
    );
    await error.getByRole("button", { name: "查询 SKU" }).last().click();
    await expect
      .element(error.getByText("Sanity 产品查询失败。").last())
      .toBeVisible();
  });

  it("clears a previously matched identity when a later lookup is unmatched", async () => {
    const onMatched = vi.fn();
    const lookup = vi
      .fn<SanityProductSource["findBySku"]>()
      .mockResolvedValueOnce({
        status: "matched",
        product: { sanityProductId: "sanity-a", sku: "A" },
      })
      .mockResolvedValueOnce({ status: "unmatched", sku: "B" });
    const screen = await render(
      <SanityProductLookup
        sku="A"
        source={source(lookup)}
        onMatched={onMatched}
      />,
    );
    await screen.getByRole("button", { name: "查询 SKU" }).click();
    expect(onMatched).toHaveBeenCalledWith("sanity-a");
    await screen.getByRole("button", { name: "查询 SKU" }).click();
    await expect
      .element(screen.getByText("未在 Sanity 中找到匹配的 SKU。"))
      .toBeVisible();
    expect(onMatched).toHaveBeenCalledTimes(1);
  });

  it("ignores a late response for SKU A after switching to SKU B", async () => {
    let resolve!: (
      value: Awaited<ReturnType<SanityProductSource["findBySku"]>>,
    ) => void;
    const lookup = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<SanityProductSource["findBySku"]>>>(
          (r) => {
            resolve = r;
          },
        ),
    );
    const onMatched = vi.fn();
    const screen = await render(
      <SanityProductLookup
        sku="A"
        source={source(lookup)}
        onMatched={onMatched}
      />,
    );
    await screen.getByRole("button", { name: "查询 SKU" }).click();
    await screen.rerender(
      <SanityProductLookup
        sku="B"
        source={source(lookup)}
        onMatched={onMatched}
      />,
    );
    resolve({
      status: "matched",
      product: { sanityProductId: "sanity-a", sku: "A" },
    });
    await expect
      .element(screen.getByText("未在 Sanity 中找到匹配的 SKU。"))
      .toBeVisible();
    expect(onMatched).not.toHaveBeenCalled();
  });
});

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

    await screen.getByRole("button", { name: "Look up SKU" }).click();
    await expect
      .element(screen.getByText("Looking up SKU in Sanity…"))
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
    await unmatched.getByRole("button", { name: "Look up SKU" }).click();
    await expect
      .element(unmatched.getByText("No Sanity product matched this SKU."))
      .toBeVisible();

    const error = await render(
      <SanityProductLookup
        sku="RMK-100"
        source={source(async (sku) => ({
          status: "error",
          sku,
          message: "Sanity product lookup failed.",
        }))}
        onMatched={vi.fn()}
      />,
    );
    await error.getByRole("button", { name: "Look up SKU" }).last().click();
    await expect
      .element(error.getByText("Sanity product lookup failed.").last())
      .toBeVisible();
  });
});

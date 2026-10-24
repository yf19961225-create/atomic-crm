import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ProductCandidateImage } from "./ProductCandidateImage";

const website = "https://romiku.com/images/products-local/gc43.jpg";
const sanity = "https://res.cloudinary.com/example/gc43.jpg";

describe("ProductCandidateImage", () => {
  it("shows no-image state without issuing a candidate request", async () => {
    const screen = await render(
      <ProductCandidateImage
        sku="EMPTY"
        candidates={[]}
        alt="EMPTY 图片"
        sizeClassName="h-10 w-10"
      />,
    );
    await expect.element(screen.getByText("暂无图片")).toBeVisible();
    expect(screen.container.querySelector("img")).toBeNull();
  });

  it("keeps a pending image invisible, then shows the next successful candidate", async () => {
    const screen = await render(
      <ProductCandidateImage
        sku="GC043"
        candidates={[website, sanity]}
        websiteUrl={website}
        alt="GC043 图片"
        sizeClassName="h-10 w-10"
      />,
    );
    const first = screen.getByRole("img", { name: "GC043 图片" });
    await expect.element(first).toHaveAttribute("src", website);
    expect(first.element().className).toContain("opacity-0");
    first.element().dispatchEvent(new Event("error"));
    const second = screen.getByRole("img", { name: "GC043 图片" });
    await expect.element(second).toHaveAttribute("src", sanity);
    expect(second.element().className).toContain("opacity-0");
    second.element().dispatchEvent(new Event("load"));
    await expect
      .poll(() => second.element().className)
      .toContain("opacity-100");
  });

  it("shows a clear failure state instead of a broken browser image", async () => {
    const screen = await render(
      <ProductCandidateImage
        sku="GC043"
        candidates={[website, sanity]}
        websiteUrl={website}
        alt="GC043 图片"
        sizeClassName="h-10 w-10"
      />,
    );
    screen
      .getByRole("img", { name: "GC043 图片" })
      .element()
      .dispatchEvent(new Event("error"));
    screen
      .getByRole("img", { name: "GC043 图片" })
      .element()
      .dispatchEvent(new Event("error"));
    await expect.element(screen.getByText("图片加载失败")).toBeVisible();
    expect(screen.container.querySelector("img")).toBeNull();
  });

  it("resets failures on SKU change and ignores a stale image event", async () => {
    const screen = await render(
      <ProductCandidateImage
        sku="GC043"
        candidates={[website, sanity]}
        websiteUrl={website}
        alt="产品图片"
        sizeClassName="h-10 w-10"
      />,
    );
    const stale = screen.getByRole("img", { name: "产品图片" }).element();
    stale.dispatchEvent(new Event("error"));
    screen.rerender(
      <ProductCandidateImage
        sku="005"
        candidates={["https://romiku.com/005.jpg"]}
        alt="产品图片"
        sizeClassName="h-10 w-10"
      />,
    );
    stale.dispatchEvent(new Event("error"));
    await expect
      .element(screen.getByRole("img", { name: "产品图片" }))
      .toHaveAttribute("src", "https://romiku.com/005.jpg");
  });

  it("reports the loaded URL only after success", async () => {
    const onLoaded = vi.fn();
    const screen = await render(
      <ProductCandidateImage
        sku="GC043"
        candidates={[website]}
        websiteUrl={website}
        alt="产品图片"
        sizeClassName="h-10 w-10"
        onLoaded={onLoaded}
      />,
    );
    expect(onLoaded).not.toHaveBeenCalled();
    screen
      .getByRole("img", { name: "产品图片" })
      .element()
      .dispatchEvent(new Event("load"));
    await expect.poll(() => onLoaded.mock.calls.length).toBe(1);
    expect(onLoaded).toHaveBeenCalledWith(website);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode } from "react";
import { render } from "vitest-browser-react";
import { ProductCandidateImage } from "./ProductCandidateImage";

const website = new URL("/appIcon/144.png", location.href).href;
const sanity = new URL("/appIcon/152.png", location.href).href;
// This suite drives load/error explicitly; native local asset timing must not
// race the synthetic timeout/stale-event cases. Real decode is audited separately.
const isolateImageEvents = (event: Event) => {
  if (event.isTrusted && event.target instanceof HTMLImageElement)
    event.stopImmediatePropagation();
};
beforeEach(() => {
  document.addEventListener("load", isolateImageEvents, true);
  document.addEventListener("error", isolateImageEvents, true);
});
afterEach(() => {
  document.removeEventListener("load", isolateImageEvents, true);
  document.removeEventListener("error", isolateImageEvents, true);
  vi.useRealTimers();
});

function loadedImage(image: Element) {
  Object.defineProperties(image, {
    naturalWidth: { value: 100, configurable: true },
    naturalHeight: { value: 100, configurable: true },
  });
  image.dispatchEvent(new Event("load"));
}

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
    loadedImage(second.element());
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
    await expect.element(screen.getByText("暂无图片")).toBeVisible();
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
    loadedImage(screen.getByRole("img", { name: "产品图片" }).element());
    await expect.poll(() => onLoaded.mock.calls.length).toBe(1);
    expect(onLoaded).toHaveBeenCalledWith(website);
  });
});

it("does not retry a failed URL when late candidates arrive", async () => {
  const props = { sku: "NA255", alt: "NA255 图片", sizeClassName: "h-10 w-10" };
  const screen = await render(
    <ProductCandidateImage {...props} candidates={[sanity]} />,
  );
  screen.getByRole("img").element().dispatchEvent(new Event("error"));
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  await screen.rerender(
    <ProductCandidateImage
      {...props}
      candidates={[sanity, website, website]}
    />,
  );
  await expect.element(screen.getByRole("img")).toHaveAttribute("src", website);
  screen.getByRole("img").element().dispatchEvent(new Event("error"));
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  expect(screen.container.querySelector("img")).toBeNull();
});

it("expires a stalled image and ignores its late load", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const onLoaded = vi.fn();
    const screen = await render(
      <ProductCandidateImage
        sku="NA255"
        alt="超时图片"
        sizeClassName="h-10 w-10"
        candidates={[sanity, website]}
        timeoutMs={600}
        onLoaded={onLoaded}
      />,
    );
    const stale = screen.getByRole("img").element();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByRole("img").element().getAttribute("src")).toBe(website);
    stale.dispatchEvent(new Event("load"));
    expect(onLoaded).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.container.textContent).toContain("暂无图片");
    expect(screen.container.querySelector("img")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("does not let duplicate errors skip a healthy candidate", async () => {
  const screen = await render(
    <ProductCandidateImage
      sku="NA255"
      alt="重复事件图片"
      sizeClassName="h-10 w-10"
      candidates={[sanity, website]}
    />,
  );
  const stale = screen.getByRole("img").element();
  stale.dispatchEvent(new Event("error"));
  stale.dispatchEvent(new Event("error"));
  await expect.element(screen.getByRole("img")).toHaveAttribute("src", website);
});

it("loads and recovers inside React StrictMode effect replay", async () => {
  const screen = await render(
    <StrictMode>
      <ProductCandidateImage
        sku="STRICT"
        alt="严格模式图片"
        sizeClassName="h-10 w-10"
        candidates={[sanity, website]}
      />
    </StrictMode>,
  );
  screen.getByRole("img").element().dispatchEvent(new Event("error"));
  await expect.element(screen.getByRole("img")).toHaveAttribute("src", website);
  loadedImage(screen.getByRole("img").element());
  await expect
    .poll(() => screen.getByRole("img").element().className)
    .toContain("opacity-100");
});

it("does not accept a zero-dimension load as a valid product image", async () => {
  const loaded = vi.fn();
  const screen = await render(
    <ProductCandidateImage
      sku="ZERO"
      candidates={[website]}
      alt="ZERO 图片"
      sizeClassName="h-10 w-10"
      onLoaded={loaded}
    />,
  );
  const image = screen.getByRole("img").element();
  Object.defineProperties(image, {
    naturalWidth: { value: 0 },
    naturalHeight: { value: 0 },
  });
  image.dispatchEvent(new Event("load"));
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  expect(loaded).not.toHaveBeenCalled();
});

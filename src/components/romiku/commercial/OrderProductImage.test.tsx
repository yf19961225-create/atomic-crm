import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderProductImage } from "./OrderProductImage";

const snapshot = "https://example.invalid/snapshot.png";
const website = "https://romiku.com/images/products-local/st210_main.jpg";
const setup = async (sku = "ST210", imageUrl: unknown = snapshot) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (nextSku: string, nextImage: unknown) => (
    <QueryClientProvider client={client}>
      <OrderProductImage sku={nextSku} imageUrl={nextImage} />
    </QueryClientProvider>
  );
  const screen = await render(view(sku, imageUrl));
  return { screen, view };
};
afterEach(() => vi.unstubAllGlobals());
it("preserves a working snapshot without querying or changing the order", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { screen } = await setup();
  const image = screen.getByRole("img").element();
  Object.defineProperties(image, {
    naturalWidth: { value: 100 },
    naturalHeight: { value: 100 },
  });
  image.dispatchEvent(new Event("load"));
  await expect
    .element(screen.getByRole("img"))
    .toHaveAttribute("src", snapshot);
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses only the exact SKU fallback after snapshot failure", async () => {
  const fetcher = vi.fn((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.startsWith("/api/product-catalog")
            ? { result: [] }
            : {
                images: {
                  ST210: website,
                  ST204: "https://example.invalid/wrong.png",
                },
              },
        ),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const { screen } = await setup();
  screen.getByRole("img").element().dispatchEvent(new Event("error"));
  await expect.element(screen.getByRole("img")).toHaveAttribute("src", website);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String(fetcher.mock.calls[1][0])).toBe(
    "/api/product-images?skus=ST210",
  );
  screen.getByRole("img").element().dispatchEvent(new Event("error"));
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  expect(screen.container.querySelector("img")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([{}, { ST204: website }, { ST210: snapshot }])(
  "does not borrow another SKU or retry an already failed URL: %j",
  async (images) => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url.startsWith("/api/product-catalog")
                ? { result: [] }
                : { images },
            ),
          ),
        ),
      ),
    );
    const { screen } = await setup();
    screen.getByRole("img").element().dispatchEvent(new Event("error"));
    await expect.element(screen.getByText("暂无图片")).toBeVisible();
    expect(screen.container.querySelector("img")).toBeNull();
  },
);
it("loads an exact SKU image when the snapshot is empty", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith("/api/product-catalog")
              ? { result: [] }
              : { images: { ST210: website } },
          ),
        ),
      ),
    ),
  );
  const { screen } = await setup("ST210", null);
  await expect.element(screen.getByRole("img")).toHaveAttribute("src", website);
});
it("handles an unavailable image API without retries or broken icons", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const { screen } = await setup("ST210", null);
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not request an empty SKU", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { screen } = await setup("", null);
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});
it("ignores an old SKU's delayed fallback after switching products", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const { screen, view } = await setup("ST210", null);
  await expect.poll(() => typeof resolve).toBe("function");
  await screen.rerender(view("ST204", "https://example.invalid/st204.png"));
  resolve(new Response(JSON.stringify({ images: { ST210: website } })));
  await expect
    .element(screen.getByRole("img"))
    .toHaveAttribute("src", "https://example.invalid/st204.png");
});

it("recovers a missing snapshot from the exact catalog SKU before website fallback", async () => {
  const catalogImage = "https://example.invalid/catalog-st210.png";
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith("/api/product-catalog")
              ? {
                  result: [
                    {
                      _id: "wrong",
                      sku: "ST-210",
                      images: [{ url: "https://example.invalid/wrong.png" }],
                    },
                    {
                      _id: "exact",
                      sku: "ST210",
                      images: [{ url: catalogImage }],
                    },
                  ],
                }
              : { images: { ST210: website } },
          ),
        ),
      ),
    ),
  );
  const { screen } = await setup("ST210", null);
  await expect
    .element(screen.getByRole("img"))
    .toHaveAttribute("src", catalogImage);
  screen.getByRole("img").element().dispatchEvent(new Event("error"));
  await expect.element(screen.getByRole("img")).toHaveAttribute("src", website);
});

it("rejects a normalized catalog lookalike when an exact SKU is absent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith("/api/product-catalog")
              ? {
                  result: [
                    { _id: "wrong", sku: "ST-210", images: [{ url: website }] },
                  ],
                }
              : { images: {} },
          ),
        ),
      ),
    ),
  );
  const { screen } = await setup("ST210", null);
  await expect.element(screen.getByText("暂无图片")).toBeVisible();
  expect(screen.container.querySelector("img")).toBeNull();
});

it("refreshes stale empty recovery metadata on a new observer without resetting historical snapshots", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["product-image-recovery", "ST210"],
    { candidates: [], websiteUrl: undefined },
    { updatedAt: Date.now() - 6 * 60 * 1000 },
  );
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.startsWith("/api/product-catalog")
            ? { result: [] }
            : { images: { ST210: website } },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const screen = await render(
    <QueryClientProvider client={client}>
      <OrderProductImage sku="ST210" imageUrl={null} />
      <OrderProductImage sku="ST210" imageUrl={null} />
    </QueryClientProvider>,
  );
  await expect.poll(() => fetcher.mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("img").first())
    .toHaveAttribute("src", website);
});

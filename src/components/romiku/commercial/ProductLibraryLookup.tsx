import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { cartonCbmFromPacking } from "./commercialLineItems";
import {
  loadProductProcurementOverlay,
  type ProductOverlay,
} from "../products/productProcurementOverlay";
import { ProductCandidateImage } from "../products/ProductCandidateImage";
import type { SanityCatalogProduct } from "../products/sanityCatalogSource";
import { createSanityCatalogSource } from "../products/sanityCatalogSource";
import { createSupabaseProcurementOverlayClient } from "../products/supabaseProcurementOverlayClient";
import {
  catalogThumbnailImageCandidates,
  loadWebsiteProductDetails,
} from "../products/websiteProductImages";

export type ProductSpecificationMode = "all" | "machines-only" | "none";
export type DocumentLanguage = "zh" | "en" | "es";

export function commercialSearchPanelPosition(
  viewportWidth: number,
  viewportHeight: number,
  anchor: Pick<DOMRect, "left" | "top" | "bottom" | "width">,
) {
  const margin = 12;
  const width = Math.max(0, Math.min(anchor.width, viewportWidth - margin * 2));
  const left = Math.max(
    margin,
    Math.min(anchor.left, viewportWidth - width - margin),
  );
  const below = viewportHeight - anchor.bottom - margin - 4;
  const above = anchor.top - margin - 4;
  const openAbove = below < 320 && above > below;
  const maxHeight = Math.max(0, Math.min(320, openAbove ? above : below));
  const top = openAbove ? anchor.top - 4 : anchor.bottom + 4;
  return {
    left,
    top,
    width,
    maxHeight,
    transform: openAbove ? "translateY(-100%)" : undefined,
  };
}

const languageFallbacks: Record<DocumentLanguage, DocumentLanguage[]> = {
  zh: ["zh", "en"],
  en: ["en", "zh"],
  es: ["es", "en", "zh"],
};
function localizedText(value: unknown, language: DocumentLanguage) {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const translations = value as Record<string, unknown>;
  for (const locale of languageFallbacks[language]) {
    const text = translations[locale];
    if (typeof text === "string" || typeof text === "number")
      return String(text);
  }
  return "";
}

const isSpecificationsParameter = (parameter: {
  label?: Record<string, string>;
}) =>
  Object.values(parameter.label ?? {}).some((label) =>
    ["参数", "specifications", "especificaciones"].includes(
      label.trim().toLowerCase(),
    ),
  );

export function shouldImportProductSpecifications(
  kind: "quote" | "pi" | "order",
  product: SanityCatalogProduct,
) {
  if (kind !== "quote") return false;
  const categoryParts: string[] = [];
  let category = product.category;
  while (category) {
    categoryParts.push(
      category._id ?? "",
      category.slug?.current ?? "",
      category.title?.zh ?? "",
      category.title?.en ?? "",
      category.title?.es ?? "",
    );
    category = category.parent;
  }
  const categoryText = categoryParts.join(" ").toLowerCase();
  return /machine|设备|机器/.test(categoryText);
}

export function createItemSnapshot(
  product: SanityCatalogProduct,
  resolvedImageUrl?: string,
  options: {
    includeSpecification?: boolean;
    documentLanguage?: DocumentLanguage;
    localizedPowerSupply?: Record<string, string>;
    procurementPacking?: Pick<
      ProductOverlay,
      | "supplierCount"
      | "qtyPerCarton"
      | "lengthCm"
      | "widthCm"
      | "heightCm"
      | "cartonWeightKg"
    >;
    includeUnit?: boolean;
    includeCartonWeight?: boolean;
  } = {},
) {
  const language = options.documentLanguage ?? "zh";
  const specifications = (product.parameters ?? []).find(
    isSpecificationsParameter,
  );
  const specification = [
    specifications ? localizedText(specifications.value, language) : "",
    localizedText(product.powerSupply, language) ||
      localizedText(options.localizedPowerSupply, language),
  ]
    .filter(Boolean)
    .join(" ");
  const overlay = options.procurementPacking;
  // The overlay resolves supplier overrides over product defaults per field.
  // A product with no supplier can still carry its own packing defaults.
  const hasPackingOverlay = Boolean(
    overlay &&
      (overlay.supplierCount === 1 ||
        overlay.qtyPerCarton != null ||
        overlay.lengthCm != null ||
        overlay.widthCm != null ||
        overlay.heightCm != null ||
        overlay.cartonWeightKg != null),
  );
  const packing = {
    description:
      product.packaging?.zh ??
      product.packaging?.en ??
      product.packaging?.es ??
      "",
    qty_per_carton: hasPackingOverlay
      ? (overlay?.qtyPerCarton ??
        (product.cartonQty == null ? null : Number(product.cartonQty)))
      : product.cartonQty == null
        ? null
        : Number(product.cartonQty),
    ...(hasPackingOverlay
      ? {
          length_cm: overlay?.lengthCm ?? null,
          width_cm: overlay?.widthCm ?? null,
          height_cm: overlay?.heightCm ?? null,
          ...(options.includeCartonWeight
            ? { carton_weight_kg: overlay?.cartonWeightKg ?? null }
            : {}),
        }
      : {}),
  };
  const cartonCbm = cartonCbmFromPacking(packing);
  return {
    sanity_product_id: product.id,
    sku: product.sku ?? "",
    product_snapshot: {
      name: localizedText(product.name, language) || product.sku || "",
      image_url: resolvedImageUrl ?? null,
      moq: product.moqQuantity ?? null,
      ...(options.includeUnit
        ? { unit: localizedText(product.moqUnit, language) }
        : {}),
      ...(options.includeSpecification === false ? {} : { specification }),
    },
    packing_snapshot: {
      ...packing,
      ...(cartonCbm == null ? {} : { carton_cbm: cartonCbm }),
    },
  };
}

// Optional website enrichment must not leave a visible product unselectable.
function boundedWebsiteDetails(
  products: SanityCatalogProduct[],
  signal: AbortSignal,
) {
  return new Promise<
    Awaited<ReturnType<typeof loadWebsiteProductDetails>> | undefined
  >((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (
      value?: Awaited<ReturnType<typeof loadWebsiteProductDetails>>,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve(value);
    };
    const cancel = () => {
      controller.abort();
      finish();
    };
    const timer = setTimeout(cancel, 3000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    loadWebsiteProductDetails(products, controller.signal).then(finish, () =>
      finish(),
    );
  });
}

export function ProductLibraryLookup({
  sku = "",
  onSelected,
  onManualSku,
  inputRef,
  specificationMode = "all",
  documentLanguage = "zh",
  captureQuotePacking = false,
  capturePacking = false,
  includeUnit = false,
  wideCommercial = false,
}: {
  sku?: string;
  onSelected: (snapshot: ReturnType<typeof createItemSnapshot>) => void;
  onManualSku: (sku: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  specificationMode?: ProductSpecificationMode;
  documentLanguage?: DocumentLanguage;
  /** Capture effective CRM packing only when selecting into a Quote. */
  captureQuotePacking?: boolean;
  /** Capture effective CRM packing only when a new document snapshot is selected. */
  capturePacking?: boolean;
  /** Save the Product Library unit in the selected item snapshot. */
  includeUnit?: boolean;
  /** Portal only the results outside the commercial table's scroll container. */
  wideCommercial?: boolean;
}) {
  const [search, setSearch] = useState(sku);
  const [query, setQuery] = useState<{ text: string; version: number } | null>(
    null,
  );
  const generation = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const composing = useRef(false);
  const selecting = useRef(false);
  const detailsPending = useRef<
    ReturnType<typeof boundedWebsiteDetails> | undefined
  >(undefined);
  const [searchError, setSearchError] = useState(false);
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const loadedImages = useRef<Map<string, string>>(new Map());
  const [localizedPowerSupplies, setLocalizedPowerSupplies] = useState<
    Map<string, Record<string, string>>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLInputElement>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelPosition, setSearchPanelPosition] = useState<
    ReturnType<typeof commercialSearchPanelPosition> | undefined
  >();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useLayoutEffect(() => {
    if (!wideCommercial || !searchPanelOpen) return;
    const updatePosition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setSearchPanelPosition(
        commercialSearchPanelPosition(
          window.innerWidth,
          window.innerHeight,
          anchor,
        ),
      );
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [wideCommercial, searchPanelOpen]);
  const invalidateSearch = () => {
    generation.current += 1;
    clearTimeout(debounce.current);
    setQuery(null);
    setProducts([]);
    setImages(new Map());
    loadedImages.current.clear();
    setLocalizedPowerSupplies(new Map());
    detailsPending.current = undefined;
    setActiveIndex(-1);
    setLoading(false);
    setSearchError(false);
    selecting.current = false;
  };
  const searchProducts = (value: string, immediate = false) => {
    invalidateSearch();
    const text = value.trim();
    if (!text || composing.current) return;
    const version = generation.current;
    setSearchPanelOpen(true);
    setLoading(true);
    if (immediate) setQuery({ text, version });
    else debounce.current = setTimeout(() => setQuery({ text, version }), 250);
  };
  useEffect(
    () => () => {
      generation.current += 1;
      clearTimeout(debounce.current);
    },
    [],
  );
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const current = () =>
      !controller.signal.aborted && generation.current === query.version;
    createSanityCatalogSource()
      .getPage(
        { search: query.text, includeUnpublished: false },
        controller.signal,
      )
      .then(async (page) => {
        if (!current()) return;
        const pending = boundedWebsiteDetails(page.products, controller.signal);
        detailsPending.current = pending;
        setProducts(page.products);
        setActiveIndex(page.products.length ? 0 : -1);
        setLoading(false);
        // Text candidates do not wait for optional website image/packing metadata.
        const details = await pending.catch(() => undefined);
        if (current() && details) {
          setImages(details.images);
          setLocalizedPowerSupplies(details.localizedPowerSupplies);
        }
      })
      .catch(() => {
        if (current()) {
          setProducts([]);
          setLoading(false);
          setSearchError(true);
        }
      });
    return () => controller.abort();
  }, [query]);
  useEffect(() => {
    if (activeIndex >= 0)
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  const select = async (product: SanityCatalogProduct) => {
    if (
      selecting.current ||
      !products.some((candidate) => candidate.id === product.id)
    )
      return;
    selecting.current = true;
    const version = generation.current;
    const pendingDetails = detailsPending.current;
    clearTimeout(debounce.current);
    const importMachineSpecifications =
      specificationMode === "machines-only" &&
      shouldImportProductSpecifications("quote", product);
    const procurementPacking =
      captureQuotePacking || capturePacking
        ? await loadProductProcurementOverlay(
            [product],
            createSupabaseProcurementOverlayClient(),
          )
            .then((overlay) => overlay.get(product.id))
            .catch(() => undefined)
        : undefined;
    const selectedDetails = await pendingDetails?.catch(() => undefined);
    if (generation.current !== version) return;
    onSelected(
      createItemSnapshot(
        product,
        loadedImages.current.get(product.id) ??
          catalogThumbnailImageCandidates(
            product,
            selectedDetails?.images.get(product.id) ?? images.get(product.id),
          )[0],
        {
          documentLanguage,
          localizedPowerSupply: importMachineSpecifications
            ? (selectedDetails?.localizedPowerSupplies.get(product.id) ??
              localizedPowerSupplies.get(product.id))
            : undefined,
          includeSpecification:
            specificationMode === "all" || importMachineSpecifications,
          procurementPacking,
          includeUnit,
          includeCartonWeight: capturePacking,
        },
      ),
    );
    setSearch(product.sku ?? "");
    invalidateSearch();
    setSearchPanelOpen(false);
  };
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      composing.current
    )
      return;
    if (event.key === "Enter") event.preventDefault();
    if (event.repeat && event.key === "Enter") return;
    if (event.key === "ArrowDown" && products.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, products.length - 1));
    } else if (event.key === "ArrowUp" && products.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && search.trim() !== query?.text) {
      searchProducts(search, true);
    } else if (event.key === "Enter" && activeIndex >= 0 && searchPanelOpen) {
      void select(products[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      invalidateSearch();
      setSearchPanelOpen(false);
    }
  };
  const commitManualSku = () => {
    const next = search.trim();
    if (!selecting.current && next && next !== sku) onManualSku(next);
  };
  const searchButton = (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        searchProducts(search, true);
      }}
    >
      搜索
    </button>
  );
  const clearButton = (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        setSearch("");
        invalidateSearch();
        setSearchPanelOpen(false);
      }}
    >
      清空
    </button>
  );
  const results = searchPanelOpen &&
    (loading || query || products.length > 0) && (
      <ul
        className="max-h-80 w-full overflow-y-auto rounded border bg-background shadow-md"
        style={{ maxHeight: 320, overflowY: "auto" }}
      >
        {loading && <li className="p-2">正在搜索产品…</li>}
        {!loading && !products.length && (
          <li className="p-2">
            {searchError ? "产品搜索失败，请重试" : "未找到匹配产品"}
          </li>
        )}
        {products.map((product, index) => {
          return (
            <li key={product.id}>
              <button
                type="button"
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                aria-selected={activeIndex === index}
                className={`flex h-10 w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted ${activeIndex === index ? "bg-muted" : ""}`}
                style={{ height: 40, boxSizing: "border-box" }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  // Keep focus in the lookup until click selects the catalog
                  // product. Otherwise blur commits it as a manual SKU.
                  event.preventDefault();
                }}
                onClick={() => void select(product)}
              >
                <ProductCandidateImage
                  sku={product.sku ?? product.id}
                  candidates={catalogThumbnailImageCandidates(
                    product,
                    images.get(product.id),
                  )}
                  websiteUrl={images.get(product.id)}
                  alt=""
                  sizeClassName="shrink-0"
                  sizePx={30}
                  onLoaded={(url) => {
                    if (generation.current === query?.version)
                      loadedImages.current.set(product.id, url);
                  }}
                />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap">
                  <strong>{product.sku}</strong> ·{" "}
                  {product.name?.zh ?? product.name?.en ?? "未命名产品"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  return (
    <div
      className={
        wideCommercial ? "relative w-full min-w-48" : "relative min-w-48"
      }
    >
      <input
        aria-label="搜索 SKU 或产品"
        ref={(element) => {
          triggerRef.current = element;
          if (typeof inputRef === "function") inputRef(element);
          else if (inputRef) inputRef.current = element;
        }}
        className="w-full rounded border p-1"
        value={search}
        onFocus={() => setSearchPanelOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          searchProducts(event.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
          invalidateSearch();
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          searchProducts(event.currentTarget.value);
        }}
        onKeyDown={handleInputKeyDown}
        onBlur={() => {
          commitManualSku();
          if (!selecting.current) invalidateSearch();
          setSearchPanelOpen(false);
        }}
        placeholder="SKU / 产品名称"
      />
      <div className="flex gap-2 text-sm">
        {searchButton}
        {clearButton}
      </div>
      {!wideCommercial && results && (
        <div className="absolute z-20 mt-1 w-full">{results}</div>
      )}
      {wideCommercial &&
        searchPanelOpen &&
        searchPanelPosition &&
        results &&
        createPortal(
          <div
            role="listbox"
            aria-label="产品搜索结果"
            className="fixed z-[100] overflow-hidden"
            style={searchPanelPosition}
          >
            {results}
          </div>,
          document.body,
        )}
    </div>
  );
}

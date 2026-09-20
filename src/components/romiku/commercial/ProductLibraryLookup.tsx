import { useEffect, useRef, useState, type Ref } from "react";
import type { SanityCatalogProduct } from "../products/sanityCatalogSource";
import { createSanityCatalogSource } from "../products/sanityCatalogSource";
import { loadWebsiteProductDetails } from "../products/websiteProductImages";

export type ProductSpecificationMode = "all" | "machines-only" | "none";
export type DocumentLanguage = "zh" | "en" | "es";

const languageFallbacks: Record<DocumentLanguage, DocumentLanguage[]> = {
  zh: ["zh", "en"],
  en: ["en", "zh"],
  es: ["es", "en", "zh"],
};
const powerSupplyLabels: Record<DocumentLanguage, string> = {
  zh: "供电方式",
  en: "Power Supply",
  es: "Fuente de alimentación",
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
  } = {},
) {
  const language = options.documentLanguage ?? "zh";
  const separator = language === "zh" ? "：" : ": ";
  const specifications = (product.parameters ?? []).find(
    isSpecificationsParameter,
  );
  const specification = [
    specifications &&
    localizedText(specifications.label, language) &&
    localizedText(specifications.value, language)
      ? `${localizedText(specifications.label, language)}${separator}${localizedText(specifications.value, language)}`
      : "",
    (() => {
      const powerSupply =
        localizedText(product.powerSupply, language) ||
        localizedText(options.localizedPowerSupply, language);
      return powerSupply
        ? `${powerSupplyLabels[language]}${separator}${powerSupply}`
        : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    sanity_product_id: product.id,
    sku: product.sku ?? "",
    product_snapshot: {
      name: localizedText(product.name, language) || product.sku || "",
      image_url: resolvedImageUrl ?? null,
      moq: product.moqQuantity ?? null,
      ...(options.includeSpecification === false ? {} : { specification }),
    },
    packing_snapshot: {
      description:
        product.packaging?.zh ??
        product.packaging?.en ??
        product.packaging?.es ??
        "",
      qty_per_carton:
        product.cartonQty == null ? null : Number(product.cartonQty),
    },
  };
}

export function ProductLibraryLookup({
  sku = "",
  onSelected,
  onManualSku,
  inputRef,
  specificationMode = "all",
  documentLanguage = "zh",
}: {
  sku?: string;
  onSelected: (snapshot: ReturnType<typeof createItemSnapshot>) => void;
  onManualSku: (sku: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  specificationMode?: ProductSpecificationMode;
  documentLanguage?: DocumentLanguage;
}) {
  const [search, setSearch] = useState(sku);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [localizedPowerSupplies, setLocalizedPowerSupplies] = useState<
    Map<string, Record<string, string>>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setProducts([]);
      return;
    }
    setLoading(true);
    createSanityCatalogSource()
      .getPage({ search: query, includeUnpublished: false })
      .then(async (page) => {
        const details = await loadWebsiteProductDetails(page.products).catch(
          () => ({
            images: new Map<string, string>(),
            localizedPowerSupplies: new Map<string, Record<string, string>>(),
          }),
        );
        if (!cancelled) {
          setProducts(page.products);
          setImages(details.images);
          setLocalizedPowerSupplies(details.localizedPowerSupplies);
          setActiveIndex(page.products.length ? 0 : -1);
        }
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);
  useEffect(() => {
    if (activeIndex >= 0)
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  const select = (product: SanityCatalogProduct) => {
    const importMachineSpecifications =
      specificationMode === "machines-only" &&
      shouldImportProductSpecifications("quote", product);
    onSelected(
      createItemSnapshot(product, images.get(product.id), {
        documentLanguage,
        localizedPowerSupply: importMachineSpecifications
          ? localizedPowerSupplies.get(product.id)
          : undefined,
        includeSpecification:
          specificationMode === "all" || importMachineSpecifications,
      }),
    );
    setSearch(product.sku ?? "");
    setQuery("");
    setProducts([]);
    setActiveIndex(-1);
  };
  return (
    <div className="relative min-w-48">
      <input
        aria-label="搜索 SKU 或产品"
        ref={inputRef}
        className="w-full rounded border p-1"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && products.length) {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, products.length - 1));
          } else if (event.key === "ArrowUp" && products.length) {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            select(products[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setProducts([]);
            setActiveIndex(-1);
          }
        }}
        onBlur={() => {
          const next = search.trim();
          if (next && next !== sku) onManualSku(next);
        }}
        placeholder="SKU / 产品名称"
      />
      {(loading || products.length > 0) && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border bg-background shadow">
          {loading && <li className="p-2">正在搜索产品…</li>}
          {products.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                aria-selected={activeIndex === index}
                className={`flex w-full items-center gap-2 p-2 text-left hover:bg-muted ${activeIndex === index ? "bg-muted" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(product)}
              >
                {images.get(product.id) ? (
                  <img
                    className="h-8 w-8 object-cover"
                    src={images.get(product.id)}
                    alt=""
                  />
                ) : (
                  <span className="h-8 w-8">—</span>
                )}
                <span>
                  <strong>{product.sku}</strong> ·{" "}
                  {product.name?.zh ?? product.name?.en ?? "未命名产品"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

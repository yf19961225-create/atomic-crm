import { useEffect, useId, useState } from "react";
import { useGetList, type RaRecord } from "ra-core";
import { formalCustomerSnapshot } from "./formalCustomerSnapshot";

const PAGE_SIZE = 25;

export function FormalCustomerSelector({
  value: _value,
  onSelect,
}: {
  value?: string | null;
  onSelect: (selection: {
    formalCustomerId: string | null;
    snapshot?: Record<string, unknown>;
  }) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
      setActiveIndex(0);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const directory = useGetList("romiku_formal_customer_directory", {
    pagination: { page, perPage: PAGE_SIZE },
    sort: { field: "name", order: "ASC" },
    filter: debouncedQuery
      ? { "search_text@ilike": `%${debouncedQuery}%` }
      : {},
  });
  const customers = directory.data || [];
  const options = [null, ...customers] as Array<RaRecord | null>;
  const select = (customer?: RaRecord | null) => {
    setOpen(false);
    setQuery(customer ? String(customer.name || "") : "");
    if (!customer) return onSelect({ formalCustomerId: null });
    onSelect({
      formalCustomerId: String(customer.id),
      snapshot: formalCustomerSnapshot(customer),
    });
  };
  return (
    <div className="relative grid gap-1">
      <input
        role="combobox"
        aria-label="正式客户"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        className="h-8 rounded border bg-background px-2 text-sm"
        placeholder="搜索公司、品牌、联系人、国家/地区"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, options.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            select(options[activeIndex]);
          } else if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="正式客户结果"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded border bg-background shadow"
        >
          {options.map((customer, index) => (
            <button
              key={customer?.id || "unlinked"}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className="block w-full px-2 py-1 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(customer)}
            >
              {customer
                ? [
                    customer.name,
                    customer.brand,
                    customer.contact,
                    customer.country,
                  ]
                    .filter(Boolean)
                    .join(" / ")
                : "不关联正式客户（仅当前单据）"}
            </button>
          ))}
          {directory.pageInfo?.hasNextPage && (
            <button
              type="button"
              className="w-full border-t px-2 py-1 text-left text-sm text-primary"
              onClick={() => setPage((current) => current + 1)}
            >
              加载更多客户
            </button>
          )}
          {directory.isPending && (
            <p className="px-2 py-1 text-sm">正在加载客户…</p>
          )}
          {!directory.isPending && !customers.length && (
            <p className="px-2 py-1 text-sm">没有匹配客户。</p>
          )}
        </div>
      )}
      {directory.error && <span role="alert">无法加载正式客户。</span>}
    </div>
  );
}

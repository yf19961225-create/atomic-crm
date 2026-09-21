import { useState } from "react";
import { useGetList, type RaRecord } from "ra-core";
import { formalCustomerSnapshot } from "./formalCustomerSnapshot";

export function FormalCustomerSelector({
  value,
  onSelect,
}: {
  value?: string | null;
  onSelect: (selection: {
    formalCustomerId: string | null;
    snapshot?: Record<string, unknown>;
  }) => void;
}) {
  const [search, setSearch] = useState("");
  const directory = useGetList("romiku_formal_customer_directory", {
    pagination: { page: 1, perPage: 25 },
    sort: { field: "name", order: "ASC" },
    filter: search ? { "search_text@ilike": `%${search}%` } : {},
  });
  const select = (id: string) => {
    if (!id) return onSelect({ formalCustomerId: null });
    const customer = directory.data?.find(
      (candidate) => String(candidate.id) === id,
    );
    if (!customer) return;
    onSelect({
      formalCustomerId: String(customer.id),
      snapshot: formalCustomerSnapshot(customer as RaRecord),
    });
  };
  return (
    <div className="grid gap-1">
      <input
        aria-label="搜索正式客户"
        className="h-8 rounded border bg-background px-2 text-sm"
        placeholder="公司、品牌、联系人、国家/地区"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        aria-label="选择正式客户"
        className="h-8 rounded border bg-background px-2 text-sm"
        value={value || ""}
        onChange={(event) => select(event.target.value)}
        disabled={directory.isPending}
      >
        <option value="">不关联正式客户（仅当前单据）</option>
        {(directory.data || []).map((customer) => (
          <option value={String(customer.id)} key={customer.id}>
            {[customer.name, customer.brand, customer.contact, customer.country]
              .filter(Boolean)
              .join(" · ")}
          </option>
        ))}
      </select>
      {directory.error && <span role="alert">无法加载正式客户。</span>}
    </div>
  );
}

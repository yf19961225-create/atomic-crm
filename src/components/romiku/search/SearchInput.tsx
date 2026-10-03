export function SearchInput({
  value,
  onChange,
  label = "搜索业务记录",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label>
      {label}{" "}
      <input
        type="search"
        className="w-full min-w-0 rounded border p-2 sm:w-[34rem] sm:max-w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索单号、客户、联系方式、SKU、产品或备注"
      />
    </label>
  );
}

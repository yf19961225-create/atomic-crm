import { Button } from "@/components/ui/button";

export function SearchInput({
  value,
  onChange,
  onSubmit,
  onClear,
  busy = false,
  label = "搜索业务记录",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <label>
        {label}{" "}
        <input
          type="search"
          className="w-full min-w-0 rounded border p-2 sm:w-[34rem] sm:max-w-full"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            )
              return;
            event.preventDefault();
            onSubmit?.(value.trim());
          }}
          placeholder="搜索单号、客户、联系方式、SKU、产品或备注"
        />
      </label>
      {onSubmit && onClear && (
        <>
          <Button type="button" onClick={() => onSubmit(value.trim())}>
            {busy ? "搜索中…" : "搜索"}
          </Button>
          <Button type="button" variant="outline" onClick={onClear}>
            清空
          </Button>
        </>
      )}
    </div>
  );
}

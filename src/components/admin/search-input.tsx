import { useEffect, useState } from "react";
import { useTranslate } from "ra-core";
import { useController, useFormContext } from "react-hook-form";
import type { TextInputProps } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Text input with a search icon, designed for filter forms without a label.
 *
 * It automatically uses the 'q' source for full-text search by default.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/searchinput/ SearchInput documentation}
 *
 * @example
 * import { List, DataTable, SearchInput } from '@/components/admin';
 *
 * const postListFilters = [
 *   <SearchInput source="q" alwaysOn />,
 * ];
 *
 * const PostList = () => (
 *   <List filters={postListFilters}>
 *     <DataTable>
 *       <DataTable.Col source="title" />
 *       <DataTable.Col source="author" />
 *       <DataTable.Col source="published_at" />
 *     </DataTable>
 *   </List>
 * );
 */
export const SearchInput = (inProps: SearchInputProps) => {
  const { label, className, disableClearable, source = "q" } = inProps;

  const translate = useTranslate();
  const { control, setValue } = useFormContext();
  const { field } = useController({ name: source, control });
  const [draft, setDraft] = useState(String(field.value ?? ""));
  useEffect(() => setDraft(String(field.value ?? "")), [field.value]);
  const submit = () => setValue(source, draft.trim(), { shouldDirty: true });
  const handleClear = () => {
    setDraft("");
    setValue(source, "", { shouldDirty: true });
  };

  if (label) {
    throw new Error(
      "<SearchInput> isn't designed to be used with a label prop. Use <TextInput> if you need a label.",
    );
  }

  const showClearButton = !disableClearable;

  return (
    <div className="flex flex-grow items-center gap-2 mt-auto">
      <input
        type="search"
        aria-label={translate("ra.action.search")}
        name={field.name}
        ref={field.ref}
        onBlur={field.onBlur}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229
          )
            return;
          event.preventDefault();
          submit();
        }}
        placeholder={translate("ra.action.search")}
        className={cn(
          "min-w-0 flex-grow rounded border bg-background p-2",
          className,
        )}
      />
      <Button type="button" onClick={submit}>
        {translate("ra.action.search")}
      </Button>
      {showClearButton && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          aria-label="清空"
        >
          清空
        </Button>
      )}
    </div>
  );
};

export type SearchInputProps = TextInputProps & {
  disableClearable?: boolean;
};

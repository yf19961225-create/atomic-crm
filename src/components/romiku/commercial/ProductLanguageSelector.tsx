import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  documentLanguage,
  productLanguages,
  translateSnapshot,
  type DocumentLanguage,
} from "./productLanguage";
import type { CommercialItem } from "./commercialLineItems";
export function ProductLanguageSelector({
  value,
  editable,
  items,
  onChange,
}: {
  value: unknown;
  editable: boolean;
  items: CommercialItem[];
  onChange: (language: DocumentLanguage, items?: CommercialItem[]) => void;
}) {
  const [pending, setPending] = useState<DocumentLanguage | null>(null);
  const apply = (convert: boolean) => {
    if (!pending) return;
    onChange(
      pending,
      convert
        ? items.map((item) => ({
            ...item,
            product_snapshot: translateSnapshot(
              (item.product_snapshot ?? {}) as Record<string, unknown>,
              pending,
            ),
          }))
        : undefined,
    );
    setPending(null);
  };
  return (
    <section
      className="rounded border bg-muted/30 p-3 text-sm"
      aria-label="产品语言设置"
    >
      <label className="flex flex-wrap items-center gap-2">
        产品语言 / Product Language
        <select
          aria-label="产品语言 / Product Language"
          className="h-8 rounded border bg-background px-2"
          disabled={!editable}
          value={documentLanguage(value)}
          onChange={(event) => {
            const next = documentLanguage(event.target.value);
            if (items.length) setPending(next);
            else onChange(next);
          }}
        >
          {Object.entries(productLanguages).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {pending && (
        <div
          role="group"
          aria-label="确认产品语言切换"
          className="mt-2 space-y-2"
        >
          <p>
            是否转换已有产品？只更新仍与自动带入文本相同的字段；人工修改和历史文本保留。缺少翻译的字段留空并标记待翻译，数值和图片不变。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => apply(true)}>
              转换适用产品
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => apply(false)}
            >
              仅用于新产品
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPending(null)}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import type { RaRecord } from "ra-core";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  followupMethodLabel,
  relationshipStatusLabel,
} from "../relationshipLabels";
import { readRelated } from "./workflow";

export type Field = {
  key: string;
  label: string;
  type?: "textarea" | "url" | "email" | "datetime-local" | "checkbox";
  required?: boolean;
  options?: string[];
  choices?: { id: string; label: string }[];
  reference?: string;
};
export type Values = Record<string, unknown>;
export const labelFor = (value: string) =>
  [
    "WhatsApp",
    "Email",
    "Phone",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Other",
  ].includes(value)
    ? followupMethodLabel(value)
    : relationshipStatusLabel(value);
export function valueAt(values: Values, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object"
          ? (value as Values)[part]
          : undefined,
      values,
    );
}
export function setValue(values: Values, key: string, value: unknown): Values {
  const [head, ...tail] = key.split(".");
  return {
    ...values,
    [head]: tail.length
      ? setValue((values[head] as Values) || {}, tail.join("."), value)
      : value,
  };
}
const inputClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";
function ReferenceSelect({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  const provider = useDataProvider();
  const {
    data = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["romiku-choices", field.reference],
    queryFn: () => readRelated(provider, field.reference!, {}),
  });
  const choices = data.map((row: RaRecord) => ({
    id: String(field.reference === "sales" ? row.user_id : row.id),
    label:
      field.reference === "sales"
        ? `${row.first_name} ${row.last_name}`
        : row.name,
  }));
  return (
    <>
      <select
        aria-label={field.label}
        className={inputClass}
        value={value}
        disabled={isPending || !!error}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">未分配／不关联</option>
        {value && !choices.some((choice) => choice.id === value) && (
          <option value={value}>{value}</option>
        )}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      {error && <p role="alert">无法加载{field.label}选项。</p>}
    </>
  );
}
export function WorkflowFields({
  fields,
  values,
  onChange,
}: {
  fields: Field[];
  values: Values;
  onChange: (values: Values) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const value = valueAt(values, field.key);
        const change = (next: unknown) =>
          onChange(setValue(values, field.key, next));
        return (
          <label
            key={field.key}
            className={`flex flex-col gap-1 text-sm ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
          >
            <span>{field.label}</span>
            {field.reference ? (
              <ReferenceSelect
                field={field}
                value={String(value ?? "")}
                onChange={change}
              />
            ) : field.options || field.choices ? (
              <select
                aria-label={field.label}
                className={inputClass}
                required={field.required}
                value={String(value ?? "")}
                onChange={(event) => change(event.target.value)}
              >
                {!field.required && <option value="">无</option>}
                {(
                  field.choices ||
                  field.options!.map((option) => ({
                    id: option,
                    label: labelFor(option),
                  }))
                ).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => change(event.target.checked)}
              />
            ) : field.type === "textarea" ? (
              <Textarea
                required={field.required}
                value={String(value ?? "")}
                onChange={(event) => change(event.target.value)}
              />
            ) : (
              <Input
                // URL fields intentionally use text validation: users may enter
                // a bare domain and the shared write helper adds https://.
                type={field.type === "url" ? "text" : field.type || "text"}
                inputMode={field.type === "url" ? "url" : undefined}
                required={field.required}
                value={String(value ?? "")}
                onChange={(event) => change(event.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
export const ownerField: Field = {
  key: "owner_id",
  label: "负责人",
  reference: "sales",
};
export const contactFields: Field[] = [
  { key: "name", label: "联系人姓名", required: true },
  { key: "title", label: "职位" },
  { key: "department", label: "部门" },
  {
    key: "role",
    label: "角色",
    options: [
      "owner",
      "decision_maker",
      "buyer",
      "purchasing_assistant",
      "finance",
      "other",
    ],
  },
  { key: "email", label: "电子邮箱", type: "email" },
  { key: "phone", label: "电话" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "wechat", label: "WeChat" },
  { key: "social_urls.linkedin", label: "LinkedIn", type: "url" },
  { key: "social_urls.instagram", label: "Instagram", type: "url" },
  { key: "is_primary", label: "主要联系人", type: "checkbox" },
  { key: "is_active", label: "当前在职／有效", type: "checkbox" },
  { key: "notes", label: "联系人备注", type: "textarea" },
];

import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import type { RaRecord } from "ra-core";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
export const labelFor = (value: string) => value.replaceAll("_", " ");
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
        <option value="">Unassigned / no link</option>
        {value && !choices.some((choice) => choice.id === value) && (
          <option value={value}>{value}</option>
        )}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert">Could not load {field.label.toLowerCase()} choices.</p>
      )}
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
                {!field.required && <option value="">None</option>}
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
                type={field.type || "text"}
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
  label: "Owner",
  reference: "sales",
};
export const contactFields: Field[] = [
  { key: "name", label: "Contact name", required: true },
  { key: "title", label: "Job title" },
  { key: "department", label: "Department" },
  {
    key: "role",
    label: "Role",
    options: [
      "owner",
      "decision_maker",
      "buyer",
      "purchasing_assistant",
      "finance",
      "other",
    ],
  },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "wechat", label: "WeChat" },
  { key: "social_urls.linkedin", label: "LinkedIn", type: "url" },
  { key: "social_urls.instagram", label: "Instagram", type: "url" },
  { key: "is_primary", label: "Primary contact", type: "checkbox" },
  { key: "is_active", label: "Currently employed / active", type: "checkbox" },
  { key: "notes", label: "Contact notes", type: "textarea" },
];

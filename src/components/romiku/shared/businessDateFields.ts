/** Existing editable ROMIKU business fields only; no system timestamps. */
export const businessDateFieldKinds: Record<
  string,
  "date" | "datetime" | "factory"
> = {
  document_date: "date",
  valid_until: "date",
  reference_date: "date",
  effective_date: "date",
  "terms_snapshot.valid_until": "date",
  "terms_snapshot.expected_delivery": "date",
  due_at: "datetime",
  deposit_due_at: "datetime",
  balance_due_at: "datetime",
  expected_delivery_at: "datetime",
  actual_delivery_at: "datetime",
  follow_up_at: "datetime",
  contacted_at: "datetime",
  next_follow_up_at: "datetime",
  packing_at: "datetime",
  received_at: "datetime",
  factory_due_at: "factory",
};

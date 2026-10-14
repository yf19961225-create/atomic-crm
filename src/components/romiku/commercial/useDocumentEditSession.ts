import { normalizeSpecificationDisplay } from "../quotes/normalizeSpecificationDisplay";
import { editableSignature } from "../updates/editableSnapshot";
import { useAppDraft } from "../updates/drafts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import type { CommercialItem } from "./commercialLineItems";

const copy = <T>(value: T): T => structuredClone(value);
const numbers = [
  "freight",
  "discount",
  "other_expenses",
  "usd_cny_rate",
  "deposit_percent",
  "quantity",
  "unit_price",
  "source_cny_unit_price",
  "position",
  "moq",
  "cartons",
  "carton_qty",
  "qty_per_carton",
  "length_cm",
  "width_cm",
  "height_cm",
  "carton_cbm",
  "carton_weight_kg",
];
const header = (value: Values) =>
  editableSignature(
    value,
    [
      "status",
      "counterparty_snapshot",
      "formal_customer_id",
      "bank_snapshot",
      "terms_snapshot",
      "currency",
      "fx_enabled",
      "usd_cny_rate",
      "document_number",
      "document_language",
      "document_date",
      "valid_until",
      "follow_up_at",
      "due_at",
      "freight",
      "discount",
      "other_expenses",
      "price_term",
      "shipment_method",
      "notes",
      "deposit_percent",
      "deposit_due_at",
      "balance_due_at",
      "expected_delivery_at",
      "actual_delivery_at",
      "purchase_order_number",
    ],
    numbers,
  );
const lines = (items: CommercialItem[], normalizeQuoteSpecification = false) =>
  JSON.stringify(
    items.map((item) =>
      editableSignature(
        normalizeQuoteSpecification
          ? {
              ...item,
              product_snapshot: {
                ...item.product_snapshot,
                specification: normalizeSpecificationDisplay(
                  item.product_snapshot?.specification,
                ),
              },
            }
          : item,
        [
          "sku",
          "sanity_product_id",
          "quantity",
          "unit_price",
          "source_cny_unit_price",
          "product_snapshot",
          "packing_snapshot",
          "requirement",
          "customer_code",
          "notes",
          "position",
        ],
        numbers,
      ),
    ),
  );

/** Shared client-side transaction for Quote, PI, and Order editors. */
export function useDocumentEditSession(
  record: RaRecord,
  persistedItems: CommercialItem[] | undefined,
  options?: { readyForEdit: boolean; normalizeQuoteSpecification?: boolean },
) {
  const [editing, setEditing] = useState(false);
  const [savedValues, setSavedValues] = useState<Values>(() => copy(record));
  const [savedItems, setSavedItems] = useState<CommercialItem[]>(() =>
    copy(persistedItems || []),
  );
  const [values, setValues] = useState<Values>(() => copy(record));
  const [items, setItems] = useState<CommercialItem[]>(() =>
    copy(persistedItems || []),
  );
  const [blankRowsDirty, setBlankRowsDirty] = useState(false);

  useEffect(() => {
    if (editing || !persistedItems) return;
    const nextValues = copy(record);
    const nextItems = copy(persistedItems);
    setSavedValues(nextValues);
    setSavedItems(nextItems);
    setValues(nextValues);
    setItems(nextItems);
  }, [editing, persistedItems, record]);

  const readyForEdit = options?.readyForEdit;
  const start = useCallback(() => {
    if (editing) return;
    // Quote opts into a query readiness gate. Seed both the saved baseline and
    // draft from the current complete response, not an effect-lagging copy.
    if (readyForEdit !== undefined) {
      if (!readyForEdit || persistedItems === undefined) return;
      setSavedValues(copy(record));
      setSavedItems(copy(persistedItems));
      setValues(copy(record));
      setItems(copy(persistedItems));
    } else {
      setValues(copy(savedValues));
      setItems(copy(savedItems));
    }
    setBlankRowsDirty(false);
    setEditing(true);
  }, [editing, readyForEdit, persistedItems, record, savedItems, savedValues]);
  const cancel = useCallback(() => {
    setValues(copy(savedValues));
    setItems(copy(savedItems));
    setBlankRowsDirty(false);
    setEditing(false);
  }, [savedItems, savedValues]);
  const commit = useCallback(
    (nextValues: Values, nextItems: CommercialItem[]) => {
      setSavedValues(copy(nextValues));
      setSavedItems(copy(nextItems));
      setValues(copy(nextValues));
      setItems(copy(nextItems));
      setBlankRowsDirty(false);
      setEditing(false);
    },
    [],
  );
  const normalizeQuoteSpecification = options?.normalizeQuoteSpecification;
  const dirty = useMemo(
    () =>
      editing &&
      (blankRowsDirty ||
        header(values) !== header(savedValues) ||
        lines(items, normalizeQuoteSpecification) !==
          lines(savedItems, normalizeQuoteSpecification)),
    [
      editing,
      blankRowsDirty,
      items,
      savedItems,
      savedValues,
      values,
      normalizeQuoteSpecification,
    ],
  );
  return {
    editing,
    values,
    setValues,
    items,
    setItems,
    setBlankRowsDirty,
    savedItems,
    start,
    cancel,
    commit,
    dirty,
  };
}

/** Native page-unload guard plus a reusable decision for in-app back links. */
export function useUnsavedDocumentGuard(dirty: boolean) {
  useAppDraft(dirty);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  return useCallback(
    () => !dirty || window.confirm("存在未保存的修改，确定离开吗？"),
    [dirty],
  );
}

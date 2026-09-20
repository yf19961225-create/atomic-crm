import { useCallback, useEffect, useMemo, useState } from "react";
import type { RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import type { CommercialItem } from "./commercialLineItems";

const copy = <T>(value: T): T => structuredClone(value);
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Shared client-side transaction for Quote, PI, and Order editors. */
export function useDocumentEditSession(
  record: RaRecord,
  persistedItems: CommercialItem[] | undefined,
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

  useEffect(() => {
    if (editing || !persistedItems) return;
    const nextValues = copy(record);
    const nextItems = copy(persistedItems);
    setSavedValues(nextValues);
    setSavedItems(nextItems);
    setValues(nextValues);
    setItems(nextItems);
  }, [editing, persistedItems, record]);

  const start = useCallback(() => {
    setValues(copy(savedValues));
    setItems(copy(savedItems));
    setEditing(true);
  }, [savedItems, savedValues]);
  const cancel = useCallback(() => {
    setValues(copy(savedValues));
    setItems(copy(savedItems));
    setEditing(false);
  }, [savedItems, savedValues]);
  const commit = useCallback(
    (nextValues: Values, nextItems: CommercialItem[]) => {
      setSavedValues(copy(nextValues));
      setSavedItems(copy(nextItems));
      setValues(copy(nextValues));
      setItems(copy(nextItems));
      setEditing(false);
    },
    [],
  );
  const dirty = useMemo(
    () => editing && (!same(values, savedValues) || !same(items, savedItems)),
    [editing, items, savedItems, savedValues, values],
  );
  return {
    editing,
    values,
    setValues,
    items,
    setItems,
    savedItems,
    start,
    cancel,
    commit,
    dirty,
  };
}

/** Native page-unload guard plus a reusable decision for in-app back links. */
export function useUnsavedDocumentGuard(dirty: boolean) {
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

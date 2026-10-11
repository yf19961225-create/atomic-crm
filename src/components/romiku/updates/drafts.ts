import { useId, useLayoutEffect, useSyncExternalStore } from "react";

const drafts = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const hasAppDraft = () => drafts.size > 0;
export function useAppDraft(active: boolean) {
  const id = useId();
  useLayoutEffect(() => {
    if (active) drafts.add(id);
    else drafts.delete(id);
    emit();
    return () => {
      drafts.delete(id);
      emit();
    };
  }, [active, id]);
}
export function useHasAppDraft() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hasAppDraft,
    () => false,
  );
}

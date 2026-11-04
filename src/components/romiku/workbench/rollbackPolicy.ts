export const safeRollbackEnabled = () =>
  import.meta.env.VITE_WORKBENCH_SAFE_ROLLBACK === "1";
export const mayEditFactoryDue = (_rollback: boolean, isNew: boolean) => isNew;
export function productionHeaderForMode<T extends Record<string, unknown>>(
  header: T,
  _rollback: boolean,
  isNew: boolean,
): Record<string, unknown> {
  const result = { ...header };
  if (!isNew) delete result.factory_due_at;
  return result;
}

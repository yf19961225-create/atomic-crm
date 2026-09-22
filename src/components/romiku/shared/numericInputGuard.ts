export function installNumericInputWheelGuard(root: Document) {
  const onWheel = (event: WheelEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type === "number" &&
      root.activeElement === target
    ) {
      target.blur();
    }
  };
  root.addEventListener("wheel", onWheel, { capture: true });
  return () => root.removeEventListener("wheel", onWheel, { capture: true });
}

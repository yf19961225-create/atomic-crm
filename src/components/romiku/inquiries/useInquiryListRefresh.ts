import { useEffect } from "react";

/** Refresh the active complete query (rows plus count), preserving its filters/page. */
export function useInquiryListRefresh(
  enabled: boolean,
  refetch: () => Promise<unknown>,
) {
  useEffect(() => {
    if (!enabled) return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    const timer = window.setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [enabled, refetch]);
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export function useWorkbenchRefresh() {
  const cache = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void cache.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).startsWith("workbench") ||
          q.queryKey[0] === "order-payments",
      });
    };
    const client = getSupabaseClient();
    const channel = client.channel?.(`workbench-${crypto.randomUUID()}`);
    for (const table of [
      "romiku_order_collection_state",
      "romiku_production_due_state",
      "romiku_payments",
      "romiku_orders",
      "romiku_order_items",
      "romiku_production_orders",
    ])
      channel?.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh,
      );
    channel?.subscribe();
    const broadcast =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("romiku-workbench")
        : null;
    if (broadcast) broadcast.onmessage = refresh;
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      broadcast?.close();
      if (channel) void client.removeChannel(channel);
    };
  }, [cache]);
}

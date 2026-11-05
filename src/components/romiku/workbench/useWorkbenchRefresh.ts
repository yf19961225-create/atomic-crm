import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export function useWorkbenchRefresh() {
  const cache = useQueryClient();
  useEffect(() => {
    let active = true;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const revisions = new Map<string, number>();
    const refresh = () => {
      if (!active) return;
      void cache.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).startsWith("workbench") ||
          q.queryKey[0] === "order-payments",
      });
    };
    const schedule = () => {
      if (!active || pending !== undefined) return;
      pending = setTimeout(() => {
        pending = undefined;
        refresh();
      }, 50);
    };
    const notify = (payload: { new: Record<string, unknown> }) => {
      const { order_id: id, revision } = payload.new;
      if (
        typeof id !== "string" ||
        typeof revision !== "number" ||
        !Number.isSafeInteger(revision) ||
        revision <= 0
      )
        return;
      if ((revisions.get(id) ?? 0) >= revision) return;
      revisions.set(id, revision);
      if (revisions.size > 256)
        revisions.delete(revisions.keys().next().value!);
      schedule();
    };
    const client = getSupabaseClient();
    const channel = client.channel?.(`workbench-${crypto.randomUUID()}`);
    for (const table of [
      "romiku_order_collection_state",
      "romiku_production_due_state",
    ])
      channel?.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule,
      );
    channel?.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "romiku_workbench_refresh" },
      notify,
    );
    channel?.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "romiku_workbench_refresh" },
      notify,
    );
    channel?.subscribe((status) => {
      if (status === "SUBSCRIBED") schedule();
    });
    const broadcast =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("romiku-workbench")
        : null;
    if (broadcast) broadcast.onmessage = schedule;
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearTimeout(pending);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      broadcast?.close();
      // Unsubscribe removes this channel without closing the shared socket.
      // removeChannel disconnects the last channel and races a route remount.
      if (channel) void channel.unsubscribe();
    };
  }, [cache]);
}

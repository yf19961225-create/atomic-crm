import { it, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkbenchRefresh } from "./useWorkbenchRefresh";
const { channel, removeChannel } = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  return { channel, removeChannel: vi.fn() };
});
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ channel: () => channel, removeChannel }),
}));
function Watcher() {
  useWorkbenchRefresh();
  return <span>watching</span>;
}
it("releases subscription, timer, broadcast and focus listener on unmount", async () => {
  const cache = new QueryClient();
  const refresh = vi.spyOn(cache, "invalidateQueries");
  const clear = vi.spyOn(window, "clearInterval");
  const close = vi.spyOn(BroadcastChannel.prototype, "close");
  const screen = await render(
    <QueryClientProvider client={cache}>
      <Watcher />
    </QueryClientProvider>,
  );
  expect(channel.on.mock.calls.map((call) => call[1])).toEqual([
    { event: "*", schema: "public", table: "romiku_order_collection_state" },
    { event: "*", schema: "public", table: "romiku_production_due_state" },
    { event: "INSERT", schema: "public", table: "romiku_workbench_refresh" },
    { event: "UPDATE", schema: "public", table: "romiku_workbench_refresh" },
  ]);
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(1);
  await screen.unmount();
  expect(removeChannel).toHaveBeenCalledWith(channel);
  expect(clear).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

it("subscribes to protected tokens and refreshes on reconnect", async () => {
  channel.on.mockClear();
  channel.subscribe.mockClear();
  const cache = new QueryClient();
  const refresh = vi.spyOn(cache, "invalidateQueries");
  const screen = await render(
    <QueryClientProvider client={cache}>
      <Watcher />
    </QueryClientProvider>,
  );
  const filters = channel.on.mock.calls.map((call) => call[1]);
  expect(
    filters
      .filter((f) => f.table === "romiku_workbench_refresh")
      .map((f) => f.event),
  ).toEqual(["INSERT", "UPDATE"]);
  const status = channel.subscribe.mock.calls[0][0];
  expect(typeof status).toBe("function");
  status("SUBSCRIBED");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  const notify = channel.on.mock.calls.find(
    (call) => call[1].table === "romiku_workbench_refresh",
  )![2];
  notify({ new: { order_id: "qa-order", revision: 2 } });
  notify({ new: { order_id: "qa-order", revision: 2 } });
  notify({ new: { order_id: "qa-order", revision: 1 } });
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  await screen.unmount();
  notify({ new: { order_id: "qa-order", revision: 3 } });
  status("SUBSCRIBED");
  expect(refresh).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});

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
  expect(channel.on).toHaveBeenCalledTimes(6);
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

import { getAuthProvider } from "./authProvider";
const { single, match, getSession } = vi.hoisted(() => ({
  single: vi.fn(),
  match: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    auth: { getSession },
    from: () => ({ select: () => ({ match }) }),
  }),
}));
vi.mock("ra-supabase-core", () => ({
  supabaseAuthProvider: (_client: unknown, options: Record<string, unknown>) =>
    options,
}));
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
it("refreshes profile names for existing sessions without changing identity or permission IDs", async () => {
  localStorage.setItem(
    "RaStore.auth.current_sale",
    JSON.stringify({
      id: 2,
      first_name: "Pending",
      last_name: "Pending",
      administrator: false,
    }),
  );
  getSession.mockResolvedValue({
    data: { session: { user: { id: "auth-user-b" } } },
  });
  match.mockReturnValue({ single });
  single.mockResolvedValue({
    data: { id: 2, first_name: "吴娜", last_name: "", administrator: false },
  });
  const identity = await getAuthProvider().getIdentity!();
  expect(identity).toMatchObject({ id: 2, fullName: "吴娜" });
  expect(match).toHaveBeenCalledWith({ user_id: "auth-user-b" });
  expect(
    JSON.parse(localStorage.getItem("RaStore.auth.current_sale")!),
  ).toMatchObject({ id: 2, first_name: "吴娜", administrator: false });
});
it("does not use another cached profile when the session is absent", async () => {
  localStorage.setItem(
    "RaStore.auth.current_sale",
    JSON.stringify({ id: 2, first_name: "吴娜" }),
  );
  getSession.mockResolvedValue({ data: { session: null } });
  await expect(getAuthProvider().getIdentity!()).rejects.toThrow();
  expect(match).not.toHaveBeenCalled();
});

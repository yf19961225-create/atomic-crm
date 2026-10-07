// Reviewed target policy, not a default connection URL. Connection always comes from server env.
const projectRefs: Record<string, string> = {
  preview: "ciwaibtotispazfviims",
  production: "vddjodsbmuarshnytyvb",
};
export function serverSupabaseTarget(
  get: (name: string) => string | undefined,
): string | null {
  const vercel = get("VERCEL_ENV");
  const explicit = get("ROMIKU_DEPLOYMENT_ENV");
  if (vercel && explicit && vercel !== explicit) return null;
  const environment = vercel || explicit;
  const value = get("SUPABASE_URL");
  if (!environment || !value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    if (environment === "development") {
      return url.origin === "http://127.0.0.1:54321" ? url.origin : null;
    }
    const ref = projectRefs[environment];
    return ref && url.origin === `https://${ref}.supabase.co`
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

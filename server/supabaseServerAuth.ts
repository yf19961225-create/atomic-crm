// Server-only Supabase REST authentication. Key mode is selected by variable name,
// never by inspecting or decoding a credential.
export function supabaseServerAuthHeaders(
  get: (name: string) => string | undefined,
): { apikey: string; Authorization?: string } | null {
  const secret = get("SUPABASE_SECRET_KEY");
  if (secret) return { apikey: secret };

  const legacy = get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { apikey: legacy, Authorization: `Bearer ${legacy}` };

  return null;
}

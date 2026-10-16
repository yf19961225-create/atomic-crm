// Temporary Preview-only Vercel function. Remove immediately after runtime verification.
const targetProjectRef = "ciwaibtotispazfviims";
const targetUrl = `https://${targetProjectRef}.supabase.co`;
const branch = "codex/production-factory-due-date";

type DiagnosticResult = {
  previewGuard: boolean;
  targetProjectRef: string;
  serviceRoleRequestSucceeded: boolean;
  httpStatus: number | null;
  buildSha: string | null;
};

function reply(status: number, result: DiagnosticResult): Response {
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
    const result: DiagnosticResult = {
      previewGuard: false,
      targetProjectRef,
      serviceRoleRequestSucceeded: false,
      httpStatus: null,
      buildSha,
    };
    if (request.method !== "GET") return reply(405, result);
    if (
      process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== branch ||
      process.env.SUPABASE_URL !== targetUrl
    )
      return reply(403, result);

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRole) return reply(503, result);
    result.previewGuard = true;

    try {
      const upstream = await fetch(
        `${targetUrl}/rest/v1/romiku_product_extensions?select=id&limit=1`,
        {
          method: "GET",
          headers: {
            apikey: serviceRole,
            Authorization: `Bearer ${serviceRole}`,
            Accept: "application/json",
          },
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
      result.httpStatus = upstream.status;
      result.serviceRoleRequestSucceeded = upstream.ok;
      // Never read or return the row or any upstream error body.
      await upstream.body?.cancel();
      return reply(200, result);
    } catch {
      return reply(200, result);
    }
  },
};

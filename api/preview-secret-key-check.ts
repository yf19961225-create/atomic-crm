// Temporary Preview-only runtime check. Remove immediately after verification.
const targetProjectRef = "ciwaibtotispazfviims";
const targetUrl = `https://${targetProjectRef}.supabase.co`;
const targetBranch = "codex/production-factory-due-date";

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
    const result: DiagnosticResult = {
      previewGuard: false,
      targetProjectRef,
      serviceRoleRequestSucceeded: false,
      httpStatus: null,
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    };
    if (request.method !== "GET") return reply(405, result);
    if (
      process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== targetBranch ||
      process.env.SUPABASE_URL !== targetUrl
    )
      return reply(403, result);

    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!secret) return reply(503, result);
    result.previewGuard = true;

    try {
      const upstream = await fetch(
        `${targetUrl}/rest/v1/romiku_product_extensions?select=id&limit=1`,
        {
          method: "GET",
          headers: { apikey: secret, Accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
      result.httpStatus = upstream.status;
      result.serviceRoleRequestSucceeded = upstream.ok;
      await upstream.body?.cancel();
    } catch {
      // Network errors have no upstream status. Never expose the error text.
    }
    return reply(200, result);
  },
};

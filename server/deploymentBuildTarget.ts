const expectedRefs = {
  preview: "ciwaibtotispazfviims",
  production: "vddjodsbmuarshnytyvb",
} as const;

type DeploymentEnvironment = keyof typeof expectedRefs;
type Environment = Record<string, string | undefined>;

function exactSupabaseRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertDeploymentBuildTarget(env: Environment): {
  environment: DeploymentEnvironment;
  projectRef: string;
} | null {
  const deployment = env.VERCEL_ENV;
  if (!deployment && !env.VERCEL) return null;
  if (deployment !== "preview" && deployment !== "production") {
    throw new Error(
      "Vercel build blocked: deployment environment is missing or unsupported",
    );
  }
  if (env.ROMIKU_DEPLOYMENT_ENV && env.ROMIKU_DEPLOYMENT_ENV !== deployment) {
    throw new Error(
      "Vercel build blocked: deployment environment declarations disagree",
    );
  }
  const expected = expectedRefs[deployment];
  if (
    exactSupabaseRef(env.VITE_SUPABASE_URL) !== expected ||
    exactSupabaseRef(env.SUPABASE_URL) !== expected
  ) {
    throw new Error(
      `Vercel ${deployment} build blocked: frontend/server Supabase targets must both be ${expected}`,
    );
  }
  return { environment: deployment, projectRef: expected };
}

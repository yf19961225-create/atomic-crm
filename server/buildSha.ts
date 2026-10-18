import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

type BuildEnvironment = Record<string, string | undefined>;

function readLocalGitSha(): string | undefined {
  if (!existsSync(path.join(process.cwd(), ".git"))) return undefined;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

export function resolveBuildSha(
  env: BuildEnvironment,
  readGitSha: () => string | undefined = readLocalGitSha,
): string {
  const sources = [
    ["VERCEL_GIT_COMMIT_SHA", env.VERCEL_GIT_COMMIT_SHA],
    ["ROMIKU_BUILD_SHA", env.ROMIKU_BUILD_SHA],
  ] as const;

  for (const [name, value] of sources) {
    if (!value) continue;
    if (!/^[a-f0-9]{40}$/i.test(value)) {
      throw new Error(
        `Build SHA invalid: ${name} must be a 40-character hex SHA`,
      );
    }
    return value.toLowerCase();
  }

  const localSha = readGitSha();
  if (localSha) {
    if (!/^[a-f0-9]{40}$/i.test(localSha)) {
      throw new Error(
        "Build SHA invalid: local Git HEAD must be a 40-character hex SHA",
      );
    }
    return localSha.toLowerCase();
  }

  throw new Error(
    "Build SHA unavailable: provide VERCEL_GIT_COMMIT_SHA or ROMIKU_BUILD_SHA",
  );
}

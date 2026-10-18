import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveBuildSha } from "./buildSha";

const vercelSha = "a".repeat(40);
const explicitSha = "b".repeat(40);
const localSha = "c".repeat(40);

describe("build SHA resolution", () => {
  it("uses VERCEL_GIT_COMMIT_SHA without reading Git", () => {
    const readGit = vi.fn(() => localSha);
    expect(resolveBuildSha({ VERCEL_GIT_COMMIT_SHA: vercelSha }, readGit)).toBe(
      vercelSha,
    );
    expect(readGit).not.toHaveBeenCalled();
  });

  it("uses ROMIKU_BUILD_SHA when Vercel does not provide a SHA", () => {
    const readGit = vi.fn(() => localSha);
    expect(resolveBuildSha({ ROMIKU_BUILD_SHA: explicitSha }, readGit)).toBe(
      explicitSha,
    );
    expect(readGit).not.toHaveBeenCalled();
  });

  it("prefers the Vercel SHA when both build variables exist", () => {
    expect(
      resolveBuildSha(
        { VERCEL_GIT_COMMIT_SHA: vercelSha, ROMIKU_BUILD_SHA: explicitSha },
        () => localSha,
      ),
    ).toBe(vercelSha);
  });

  it("reads the local Git HEAD only when both build variables are absent", () => {
    const readGit = vi.fn(() => localSha);
    expect(resolveBuildSha({}, readGit)).toBe(localSha);
    expect(readGit).toHaveBeenCalledOnce();
  });

  it("uses the real local checkout HEAD when .git exists", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    expect(resolveBuildSha({})).toBe(head);
  });

  it("does not invoke Git in a directory without .git", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "romiku-no-git-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
    try {
      expect(() => resolveBuildSha({})).toThrow(
        "Build SHA unavailable: provide VERCEL_GIT_COMMIT_SHA or ROMIKU_BUILD_SHA",
      );
    } finally {
      cwd.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails clearly when no SHA source is available", () => {
    expect(() => resolveBuildSha({}, () => undefined)).toThrow(
      "Build SHA unavailable: provide VERCEL_GIT_COMMIT_SHA or ROMIKU_BUILD_SHA",
    );
  });

  it("rejects an invalid explicit SHA without silently falling back to Git", () => {
    const readGit = vi.fn(() => localSha);
    expect(() =>
      resolveBuildSha({ ROMIKU_BUILD_SHA: "invalid" }, readGit),
    ).toThrow(
      "Build SHA invalid: ROMIKU_BUILD_SHA must be a 40-character hex SHA",
    );
    expect(readGit).not.toHaveBeenCalled();
  });
});

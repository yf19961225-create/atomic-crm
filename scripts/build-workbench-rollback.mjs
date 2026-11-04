import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// Local artifact preparation only. This script cannot deploy or modify env settings.
const env = { ...process.env, VITE_WORKBENCH_SAFE_ROLLBACK: "1" };
const outDir = "dist-workbench-rollback";
const result = spawnSync("npm", ["run", "build", "--", "--outDir", outDir], {
  stdio: "inherit",
  env,
});
if (result.status !== 0) process.exit(result.status || 1);
for (const file of ["index.html", "version.json", "sw.js"]) {
  if (!statSync(resolve(outDir, file)).size)
    throw new Error(`Missing rollback asset: ${file}`);
}
const archive = "workbench-safe-rollback.tar.gz";
const packed = spawnSync("tar", ["-czf", archive, "-C", outDir, "."], {
  stdio: "inherit",
});
if (packed.status !== 0) process.exit(packed.status || 1);
const bytes = readFileSync(archive);
const version = JSON.parse(
  readFileSync(resolve(outDir, "version.json"), "utf8"),
);
writeFileSync(
  `${archive}.manifest.json`,
  JSON.stringify(
    {
      mode: "safe-rollback",
      workingTree: spawnSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).stdout.trim()
        ? "uncommitted-local-build"
        : "clean",
      localOnly: true,
      source: version,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      warning:
        "Not deployment-authorized; requires same-database Preview rollback acceptance.",
    },
    null,
    2,
  ),
);
console.warn("LOCAL ROLLBACK PACKAGE CREATED; PREVIEW ACCEPTANCE PENDING");

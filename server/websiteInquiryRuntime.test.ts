import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("loads the emitted attachment endpoint in native Node ESM without a bundler", () => {
  const root = process.cwd();
  mkdirSync(join(root, "output"), { recursive: true });
  const dir = mkdtempSync(join(root, "output/inquiry-runtime-"));
  try {
    const compile = spawnSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--target",
        "ES2022",
        "--module",
        "ESNext",
        "--moduleResolution",
        "bundler",
        "--esModuleInterop",
        "--skipLibCheck",
        "--rootDir",
        root,
        "--outDir",
        dir,
        "api/website-inquiry-xlsx.ts",
      ],
      { cwd: root, encoding: "utf8", timeout: 25000 },
    );
    expect(compile.status, compile.stdout + compile.stderr).toBe(0);
    const entry = pathToFileURL(join(dir, "api/website-inquiry-xlsx.js")).href;
    const run = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {default: endpoint} = await import(${JSON.stringify(entry)}); const response = await endpoint.fetch(new Request('https://qa.example.test/api/website-inquiry-xlsx')); if(response.status !== 405) process.exit(1);`,
      ],
      { cwd: root, encoding: "utf8", timeout: 5000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 35000);

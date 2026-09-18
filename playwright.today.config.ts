import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import { assertLocalSmokeTarget } from "./e2e/localSmokeTarget";

const local = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const baseURL = "http://127.0.0.1:5176";
assertLocalSmokeTarget(baseURL, local.API_URL);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "today-mvp.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    ...(process.env.CI && { channel: "chromium-headless-shell" }),
    // Auth tokens and fixture data should not be retained in trace archives.
    trace: "off",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5176 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: local.API_URL,
      VITE_SB_PUBLISHABLE_KEY: local.ANON_KEY,
      VITE_IS_DEMO: "false",
    },
  },
});

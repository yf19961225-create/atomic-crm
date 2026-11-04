import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/components/romiku/workbench/businessWindow.test.ts",
      "src/components/romiku/workbench/rollbackPolicy.test.ts",
    ],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts", "./tests/reset-db.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 20000,
  },
});

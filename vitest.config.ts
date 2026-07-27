import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Run tests against sources so `pnpm test` works without a prior build
      "@storepulse/core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
  },
});

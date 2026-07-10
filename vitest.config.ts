import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**", "src/middleware.ts"],
      exclude: [
        "src/generated/**",
        "src/components/**",
        "src/app/(dashboard)/**",
        "src/app/(auth)/**",
      ],
    },
    // Higher than the default 10s: this machine's transform/setup phase can
    // run 40-70s under full-parallel test-file load (Windows + many worker
    // threads), which occasionally starves an in-progress test of CPU long
    // enough to blow past a tight per-test timeout even though no test's own
    // logic is slow. Pre-existing flakiness, not caused by any single test.
    testTimeout: 30000,
  },
});

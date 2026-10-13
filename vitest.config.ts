import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});

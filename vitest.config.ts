import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@euscan/shared": src("./packages/shared/src/index.ts"),
      "@euscan/rules": src("./packages/rules/src/index.ts"),
      "@euscan/core": src("./packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "e2e/**/*.test.ts"],
  },
});

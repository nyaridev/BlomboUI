import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Client modules import through the same aliases as in vite.config.ts.
  resolve: {
    alias: {
      "@client": dir("./src/client"),
      "@shared": dir("./src/shared"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

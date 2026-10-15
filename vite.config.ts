import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { PORTS } from "./src/shared/constants.ts";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: dir("./src/client"),
  publicDir: dir("./src/client/public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@client": dir("./src/client"),
      "@shared": dir("./src/shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: PORTS.devWeb,
    strictPort: true,
    proxy: {
      "/api": { target: `http://127.0.0.1:${PORTS.devServer}`, changeOrigin: false, ws: true },
    },
  },
  build: {
    outDir: dir("./dist/client"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});

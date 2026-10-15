import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { PORTS } from "./src/shared/constants.ts";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// A second dev instance (an agent testing on a throwaway data folder while yours runs) can move
// both ports: BLOMBO_WEB_PORT for Vite, BLOMBO_API_PORT for the API it proxies to.
const webPort = Number(process.env.BLOMBO_WEB_PORT) || PORTS.devWeb;
const apiPort = Number(process.env.BLOMBO_API_PORT) || PORTS.devServer;

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
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, ws: true },
    },
  },
  build: {
    outDir: dir("./dist/client"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});

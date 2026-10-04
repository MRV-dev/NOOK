import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL("../backend/public", import.meta.url)),
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/socket.io": {
        target: "http://127.0.0.1:3000",
        ws: true,
      },
      "/uploads": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../backend/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
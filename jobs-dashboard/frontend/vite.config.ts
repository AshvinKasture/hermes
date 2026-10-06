import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/jobs/",
  server: {
    port: 5173,
    proxy: {
      "/jobs/api": {
        target: "http://localhost:9120",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jobs/, ""),
      },
      "/jobs/auth": {
        target: "http://localhost:9120",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jobs/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
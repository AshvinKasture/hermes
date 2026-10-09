import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// The app is served under /cockpit (Caddy forwards the prefix unstripped).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Deep imports into Monaco's ES modules (the package "exports" map hides some of them).
      "monaco-vs": fileURLToPath(new URL("./node_modules/monaco-editor/esm/vs", import.meta.url)),
    },
  },
  base: "/cockpit/",
  server: {
    port: 5174,
    proxy: {
      "/cockpit/api": "http://localhost:9200",
      "/cockpit/auth": "http://localhost:9200",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});

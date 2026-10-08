import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The app is served under /cockpit (Caddy forwards the prefix unstripped).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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

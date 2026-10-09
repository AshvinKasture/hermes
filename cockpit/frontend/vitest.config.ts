import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  base: "/cockpit/",
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // monacoSetup/monacoContrib only wire Monaco and its workers, which jsdom cannot run.
      exclude: ["src/main.tsx", "src/vite-env.d.ts", "src/components/files/monacoSetup.ts", "src/components/files/monacoContrib.ts"],
      reporter: ["text"],
      thresholds: { lines: 85 },
    },
  },
});

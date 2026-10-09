import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  cacheDir: `.vite-cache-${process.getuid?.() ?? "local"}`,
  base: "./",
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 900 },
});

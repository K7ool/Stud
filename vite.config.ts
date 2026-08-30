import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tauri-apps/api/core": path.resolve(__dirname, "./src/web-shims/tauri-core.ts"),
      "@tauri-apps/plugin-http": path.resolve(__dirname, "./src/web-shims/tauri-http.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "./src/web-shims/tauri-opener.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/web-shims/tauri-dialog.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "./src/web-shims/tauri-fs.ts"),
    },
  },

  clearScreen: false,
  server: {
    port: 3000,
    strictPort: false,
  },
});
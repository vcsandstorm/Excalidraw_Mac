import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  build: { target: "safari16", chunkSizeWarningLimit: 5000 },
});

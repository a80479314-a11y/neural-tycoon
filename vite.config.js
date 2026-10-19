import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import versionPlugin from "./vite-plugin-version.js";

export default defineConfig({
  plugins: [react(), tailwindcss(), versionPlugin()],
  base: './',
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});

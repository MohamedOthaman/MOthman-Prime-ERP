import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const tauriHost = process.env.TAURI_DEV_HOST;
const isTauriDev = Boolean(tauriHost);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    host: tauriHost ?? "::",
    port: isTauriDev ? 1420 : 8080,
    strictPort: isTauriDev,
    hmr: isTauriDev
      ? {
          protocol: "ws",
          host: tauriHost,
          port: 1421,
          overlay: false,
        }
      : {
          overlay: false,
        },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

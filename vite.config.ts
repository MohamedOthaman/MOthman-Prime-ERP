import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const tauriHost = process.env.TAURI_DEV_HOST;
const isTauriDev = Boolean(tauriHost);

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
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
  build: {
    // The Reports & Admin pages plus jspdf/exceljs/recharts/pdfjs together
    // dominated the main chunk. Splitting them brings initial JS down and
    // lets the heaviest paths load on demand.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // Heaviest vendor groups — isolate so report pages don't pull
          // them into the entry chunk.
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (
            id.includes("jspdf") ||
            id.includes("jspdf-autotable") ||
            id.includes("pdfjs-dist") ||
            id.includes("html2canvas") ||
            id.includes("dompurify")
          ) {
            return "vendor-pdf";
          }
          if (id.includes("exceljs") || id.includes("xlsx") || id.includes("file-saver")) {
            return "vendor-excel";
          }
          if (id.includes("dexie") || id.includes("idb-keyval")) return "vendor-storage";
          if (id.includes("@tauri-apps")) return "vendor-tauri";
          if (id.includes("@zxing")) return "vendor-barcode";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-tanstack";
          if (id.includes("@radix-ui") || id.includes("lucide-react")) return "vendor-ui";
          if (
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("scheduler")
          ) {
            return "vendor-react";
          }

          return undefined;
        },
      },
    },
  },
}));
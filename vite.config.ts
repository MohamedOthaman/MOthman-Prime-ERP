import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const tauriHost = process.env.TAURI_DEV_HOST;
const isTauriDev = Boolean(tauriHost);
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig(({ mode }) => ({
  clearScreen: false,

  server: {
    host: tauriHost ?? "::",
    port: isTauriDev ? 1420 : 8080,
    strictPort: isTauriDev,
    hmr: isTauriDev
      ? { protocol: "ws", host: tauriHost, port: 1421, overlay: false }
      : { overlay: false },
  },

  plugins: [react()],

  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },

  build: {
    // Tauri targets ES2021+ on all desktop platforms — enables modern optimizations
    target: isTauriBuild ? ["es2021", "chrome100", "safari14"] : "modules",

    // Produce source maps only for development builds (CI sets NODE_ENV=production)
    sourcemap: mode !== "production" ? "inline" : false,

    // Aggressively minify in production
    minify: mode === "production" ? "esbuild" : false,

    // Raise warning limit — heavy ERP bundles are expected; we split below
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        // ── Vendor code splitting strategy ──────────────────────────────────
        // Each group is loaded only when its feature is first used.
        // Groups are ordered heaviest → lightest so Rollup can tree-shake
        // inter-group deps correctly.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // Heavy report / visualization libraries
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";

          // PDF generation & parsing
          if (
            id.includes("jspdf") ||
            id.includes("jspdf-autotable") ||
            id.includes("pdfjs-dist") ||
            id.includes("html2canvas") ||
            id.includes("dompurify")
          ) {
            return "vendor-pdf";
          }

          // Spreadsheet generation & parsing
          if (id.includes("exceljs") || id.includes("xlsx") || id.includes("file-saver")) {
            return "vendor-excel";
          }

          // Offline storage adapters (IndexedDB / SQLite)
          if (id.includes("dexie") || id.includes("idb-keyval")) return "vendor-storage";

          // Barcode scanner
          if (id.includes("@zxing")) return "vendor-barcode";

          // Tauri APIs — updater isolated so it doesn't inflate the main chunk
          if (id.includes("@tauri-apps/plugin-updater")) return "vendor-tauri-updater";
          if (id.includes("@tauri-apps")) return "vendor-tauri";

          // Supabase client + realtime
          if (id.includes("@supabase")) return "vendor-supabase";

          // TanStack Query / Virtual
          if (id.includes("@tanstack")) return "vendor-tanstack";

          // Radix UI primitives + Lucide icons
          if (id.includes("@radix-ui") || id.includes("lucide-react")) return "vendor-ui";

          // React core — keep small for fastest first paint
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

        // Deterministic filenames for long-lived CDN caching
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },

      // Keep PDF.js worker separate — it's loaded dynamically by pdfjs-dist
      external: [],
    },

    // Report module sizes in CI
    reportCompressedSize: true,
  },

  // Optimize deps that ship CJS or large CommonJS bundles
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
    exclude: [
      "pdfjs-dist", // Has its own worker — must not be pre-bundled
    ],
  },

  // Expose update channel to the app at build time
  define: {
    __UPDATE_CHANNEL__: JSON.stringify(process.env.VITE_UPDATE_CHANNEL ?? "stable"),
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? "dev"),
  },
}));

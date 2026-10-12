import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execFileSync } from "node:child_process";
const buildSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/i.test(buildSha))
  throw new Error("Git build SHA required");
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import createHtmlPlugin from "vite-plugin-simple-html";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  plugins: [
    {
      name: "app-build-version",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: { name: "crm-build", content: buildSha },
            injectTo: "head",
          },
        ];
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ build: buildSha }),
        });
      },
    },
    react(),
    tailwindcss(),
    visualizer({
      open: process.env.NODE_ENV !== "CI",
      filename: "./dist/stats.html",
    }),
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          mainScript: `src/main.tsx`,
        },
      },
    }),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: false,
        // Navigation fallback serves precached index.html cache-first forever.
        // Let navigations revalidate the app shell instead.
        navigateFallback: null,
        runtimeCaching: [
          { urlPattern: /\/version\.json$/, handler: "NetworkOnly" },
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "romiku-app-shell" },
          },
        ],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },
      manifest: false, // Use existing manifest.json from public/
    }),
  ],
  define: {
    "import.meta.env.VITE_APP_BUILD_SHA": JSON.stringify(buildSha),
    ...(process.env.NODE_ENV === "production" && process.env.VITE_SUPABASE_URL
      ? {
          "import.meta.env.VITE_IS_DEMO": JSON.stringify(
            process.env.VITE_IS_DEMO,
          ),
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
            process.env.VITE_SUPABASE_URL,
          ),
          "import.meta.env.VITE_SB_PUBLISHABLE_KEY": JSON.stringify(
            process.env.VITE_SB_PUBLISHABLE_KEY,
          ),
          "import.meta.env.VITE_INBOUND_EMAIL": JSON.stringify(
            process.env.VITE_INBOUND_EMAIL,
          ),
          "import.meta.env.VITE_ATTACHMENTS_BUCKET": JSON.stringify(
            process.env.VITE_ATTACHMENTS_BUCKET,
          ),
        }
      : {}),
  },
  base: "./",
  esbuild: {
    keepNames: true,
  },
  build: {
    sourcemap: true,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

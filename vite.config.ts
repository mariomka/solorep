/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const EXERCISE_GIF_URL_PATTERN =
  /^https:\/\/cdn\.jsdelivr\.net\/gh\/hasaneyldrm\/exercises-dataset@[0-9a-f]{40}\/videos\/.+\.gif$/;
const EXERCISE_GIF_CACHE_NAME = "solorep-exercise-gifs";
const EXERCISE_GIF_CACHE_MAX_ENTRIES = 150;
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "site.webmanifest",
      workbox: {
        runtimeCaching: [
          {
            urlPattern: EXERCISE_GIF_URL_PATTERN,
            handler: "CacheFirst",
            options: {
              cacheName: EXERCISE_GIF_CACHE_NAME,
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: EXERCISE_GIF_CACHE_MAX_ENTRIES,
                maxAgeSeconds: ONE_YEAR_IN_SECONDS,
                purgeOnQuotaError: true,
              },
            },
          },
        ],
      },
      manifest: {
        name: "Solorep",
        short_name: "Solorep",
        description: "Compañero de entrenamiento en el gimnasio",
        lang: "es",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          {
            src: "web-app-manifest-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "web-app-manifest-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    exclude: ["e2e/**", "node_modules/**"],
  },
});

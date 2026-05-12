import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Quorum — HOA Governance",
        short_name: "Quorum",
        description: "On-chain HOA governance: proposals, treasury, documents, and more.",
        theme_color: "#1B2D4F",
        background_color: "#F9F6F0",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  define: {
    DFX_NETWORK:               JSON.stringify(process.env.DFX_NETWORK               || "local"),
    CANISTER_ID_MEMBERS:       JSON.stringify(process.env.CANISTER_ID_MEMBERS       || ""),
    CANISTER_ID_GOVERNANCE:    JSON.stringify(process.env.CANISTER_ID_GOVERNANCE    || ""),
    CANISTER_ID_TREASURY:      JSON.stringify(process.env.CANISTER_ID_TREASURY      || ""),
    CANISTER_ID_DOCUMENTS:     JSON.stringify(process.env.CANISTER_ID_DOCUMENTS     || ""),
    CANISTER_ID_ANNOUNCEMENTS: JSON.stringify(process.env.CANISTER_ID_ANNOUNCEMENTS || ""),
    CANISTER_ID_MAINTENANCE:   JSON.stringify(process.env.CANISTER_ID_MAINTENANCE   || ""),
    CANISTER_ID_VIOLATIONS:    JSON.stringify(process.env.CANISTER_ID_VIOLATIONS    || ""),
    CANISTER_ID_MEETINGS:      JSON.stringify(process.env.CANISTER_ID_MEETINGS      || ""),
    CANISTER_ID_CALENDAR:      JSON.stringify(process.env.CANISTER_ID_CALENDAR      || ""),
    CANISTER_ID_ARC:           JSON.stringify(process.env.CANISTER_ID_ARC           || ""),
    CANISTER_ID_PARKING:       JSON.stringify(process.env.CANISTER_ID_PARKING       || ""),
    CANISTER_ID_VENDORS:       JSON.stringify(process.env.CANISTER_ID_VENDORS       || ""),
    CANISTER_ID_DISCUSSIONS:   JSON.stringify(process.env.CANISTER_ID_DISCUSSIONS   || ""),
    CANISTER_ID_AMENITIES:     JSON.stringify(process.env.CANISTER_ID_AMENITIES     || ""),
    CANISTER_ID_MARKETPLACE:   JSON.stringify(process.env.CANISTER_ID_MARKETPLACE   || ""),
    CANISTER_ID_BENEFIT:       JSON.stringify(process.env.CANISTER_ID_BENEFIT       || ""),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4943",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/services/**/*.ts", "src/store/**/*.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
});

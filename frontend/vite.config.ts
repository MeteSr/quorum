import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
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

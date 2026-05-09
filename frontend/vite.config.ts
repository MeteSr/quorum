import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  define: {
    CANISTER_ID_MEMBERS:       JSON.stringify(process.env.CANISTER_ID_MEMBERS       || ""),
    CANISTER_ID_GOVERNANCE:    JSON.stringify(process.env.CANISTER_ID_GOVERNANCE    || ""),
    CANISTER_ID_TREASURY:      JSON.stringify(process.env.CANISTER_ID_TREASURY      || ""),
    CANISTER_ID_DOCUMENTS:     JSON.stringify(process.env.CANISTER_ID_DOCUMENTS     || ""),
    CANISTER_ID_ANNOUNCEMENTS: JSON.stringify(process.env.CANISTER_ID_ANNOUNCEMENTS || ""),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});

/**
 * Vitest configuration for integration tests.
 *
 * Integration tests call the real ICP canisters running on the local replica.
 * They require:
 *   1. A running local network:  icp network start -d
 *   2. Deployed canisters:       bash scripts/deploy.sh
 *   3. Canister IDs exported:    bash scripts/test-integration.sh  (handles this automatically)
 *
 * Quickstart (from repo root):
 *   bash scripts/deploy.sh && npm run test:integration
 *
 * Key differences from the unit test config:
 *   - environment: "node"  — no jsdom; ICP SDK works in Node fine
 *   - process.env.CANISTER_ID_* are injected by test-integration.sh
 *   - Longer timeouts — canister calls over HTTP are slower than in-memory
 *   - setupFiles injects a real agent with a deterministic Ed25519 identity
 *   - Tests skip themselves if CANISTER_IDs are absent (safe for CI without replica)
 *   - fileParallelism: false — shared canister state means serial execution
 */

import { defineConfig } from "vitest/config";
import path from "path";

// Load canister IDs from .env when running locally.
// In CI, scripts/test-integration.sh already exports CANISTER_ID_* env vars.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require("dotenv");
  config({ path: path.resolve(__dirname, "../.env") });
} catch {
  // dotenv not installed — env vars already set by the calling script
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Mirror vite.config.ts global defines so actor.ts and services compile
    DFX_NETWORK: JSON.stringify(process.env.DFX_NETWORK || "local"),
    // Expose canister IDs as process.env.* so services can read them at test time
    "process.env.CANISTER_ID_MEMBERS":       JSON.stringify(process.env.CANISTER_ID_MEMBERS       || ""),
    "process.env.CANISTER_ID_GOVERNANCE":    JSON.stringify(process.env.CANISTER_ID_GOVERNANCE    || ""),
    "process.env.CANISTER_ID_TREASURY":      JSON.stringify(process.env.CANISTER_ID_TREASURY      || ""),
    "process.env.CANISTER_ID_DOCUMENTS":     JSON.stringify(process.env.CANISTER_ID_DOCUMENTS     || ""),
    "process.env.CANISTER_ID_ANNOUNCEMENTS": JSON.stringify(process.env.CANISTER_ID_ANNOUNCEMENTS || ""),
    "process.env.CANISTER_ID_MAINTENANCE":   JSON.stringify(process.env.CANISTER_ID_MAINTENANCE   || ""),
    "process.env.CANISTER_ID_VIOLATIONS":    JSON.stringify(process.env.CANISTER_ID_VIOLATIONS    || ""),
    "process.env.CANISTER_ID_MEETINGS":      JSON.stringify(process.env.CANISTER_ID_MEETINGS      || ""),
    "process.env.CANISTER_ID_CALENDAR":      JSON.stringify(process.env.CANISTER_ID_CALENDAR      || ""),
    "process.env.CANISTER_ID_ARC":           JSON.stringify(process.env.CANISTER_ID_ARC           || ""),
    "process.env.CANISTER_ID_PARKING":       JSON.stringify(process.env.CANISTER_ID_PARKING       || ""),
    "process.env.CANISTER_ID_VENDORS":       JSON.stringify(process.env.CANISTER_ID_VENDORS       || ""),
    "process.env.CANISTER_ID_DISCUSSIONS":   JSON.stringify(process.env.CANISTER_ID_DISCUSSIONS   || ""),
  },
  test: {
    environment:      "node",
    globals:          true,
    include:          ["src/__tests__/integration/**/*.integration.test.ts"],
    setupFiles:       ["./src/__tests__/integration/setup.ts"],
    testTimeout:      30_000,   // canister calls over HTTP are slow on cold replica
    hookTimeout:      30_000,
    reporters:        ["verbose"],
    fileParallelism:  false,    // shared canister state — run files serially
  },
});

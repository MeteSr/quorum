/**
 * Integration test global setup.
 *
 * Runs once before any integration test file. Creates a deterministic
 * Ed25519 identity and injects it into the ICP agent singleton so all
 * service calls use a consistent principal without requiring Internet Identity.
 *
 * If the local replica is not reachable, a clear error is thrown rather than
 * letting tests fail with cryptic network errors.
 */

import { beforeAll, afterAll } from "vitest";
import { HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { setAgentForTesting } from "@/services/actor";

// ─── Deterministic test identity ──────────────────────────────────────────────
// Fixed seed → same principal every run → canister ownership checks are stable.
const TEST_SEED = new Uint8Array(32);
TEST_SEED[0] = 42;
export const testIdentity = Ed25519KeyIdentity.generate(TEST_SEED);
export const TEST_PRINCIPAL = testIdentity.getPrincipal().toText();

// ─── Replica health check ─────────────────────────────────────────────────────

async function assertReplicaRunning(): Promise<void> {
  try {
    const res = await fetch("http://localhost:4943/api/v2/status", {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error(`Replica returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Local ICP replica is not running at http://localhost:4943.\n` +
      `Start it with:  icp network start -d\n` +
      `Then deploy:    bash scripts/deploy.sh\n` +
      `Original error: ${err}`
    );
  }
}

// ─── Global setup ─────────────────────────────────────────────────────────────

let agent: HttpAgent;

beforeAll(async () => {
  await assertReplicaRunning();

  // icp-cli 0.x / pocket-ic only supports /api/v2/ for all endpoints.
  // @icp-sdk/core v5.x uses /api/v4/ for update calls and /api/v3/ for queries.
  // Rewrite v3/v4 paths to v2 so every request hits the supported endpoint.
  const v2Fetch: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const rewritten = url.replace(/\/api\/v[34]\//, "/api/v2/");
    return globalThis.fetch(rewritten, init);
  };

  agent = await HttpAgent.create({
    identity:           testIdentity,
    host:               "http://localhost:4943",
    shouldFetchRootKey: true,
    fetch:              v2Fetch,
  });

  setAgentForTesting(agent);
});

afterAll(() => {
  setAgentForTesting(null as any);
});

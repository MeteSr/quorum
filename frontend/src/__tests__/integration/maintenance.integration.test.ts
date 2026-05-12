/**
 * Integration tests — maintenance canister.
 *
 * What these tests prove that unit tests cannot:
 *   - RequestCategory + RequestStatus Variant round-trips
 *   - submitRequest returns a non-empty id
 *   - updateStatus transitions the status (with required note arg)
 *   - getMyRequests scopes to the calling principal
 *   - getOpenRequests excludes resolved requests
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/maintenance";
import { getAgent } from "@/services/actor";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = (process.env as any).CANISTER_ID_MAINTENANCE || "";
const deployed = !!CANISTER_ID;

const RUN_ID  = Date.now();
const UNIT_ID = `unit-maint-${RUN_ID}`;

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("submitRequest — Candid serialization", () => {
  let request: any;

  beforeAll(async () => {
    const a = await getActor();
    // submitRequest(unitId, category, description, photoHashes)
    const result = await a.submitRequest(
      UNIT_ID, { Plumbing: null }, "Leaky faucet in kitchen integration test", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    request = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(request.id).toBeTruthy();
  });

  it("unitId is preserved", () => {
    expect(request.unitId).toBe(UNIT_ID);
  });

  it("category Variant round-trips as Plumbing", () => {
    expect(request.category).toHaveProperty("Plumbing");
  });

  it("status starts as Open", () => {
    expect(request.status).toHaveProperty("Open");
  });

  it("createdAt is a BigInt nanosecond timestamp", () => {
    expect(typeof request.createdAt).toBe("bigint");
    expect(request.createdAt).toBeGreaterThan(BigInt("1000000000000000000"));
  });
});

describe.skipIf(!deployed)("updateStatus — status transitions", () => {
  let requestId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.submitRequest(
      UNIT_ID, { Electrical: null }, "Broken outlet for status test", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    requestId = result.ok.id;
  });

  it("transitions to InProgress", async () => {
    const a = await getActor();
    const result = await a.updateStatus(requestId, { InProgress: null }, "Starting work") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("InProgress");
  });

  it("transitions to Resolved", async () => {
    const a = await getActor();
    const result = await a.updateStatus(requestId, { Resolved: null }, "Work complete") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("Resolved");
  });
});

describe.skipIf(!deployed)("getMyRequests — principal scoping", () => {
  it("returns requests submitted by this principal", async () => {
    const a = await getActor();
    const mine = await a.getMyRequests() as any[];
    expect(Array.isArray(mine)).toBe(true);
    if (mine.length > 0) {
      expect(mine[0].submittedBy.toText()).toBe(TEST_PRINCIPAL);
    }
  });
});

describe.skipIf(!deployed)("getOpenRequests — excludes resolved", () => {
  it("returns only open/in-progress requests", async () => {
    const a = await getActor();
    const open = await a.getOpenRequests() as any[];
    for (const r of open) {
      expect(r.status).not.toHaveProperty("Resolved");
    }
  });
});

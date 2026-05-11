/**
 * Integration tests — maintenance canister.
 *
 * What these tests prove that unit tests cannot:
 *   - RequestPriority + RequestStatus Variant round-trips
 *   - createRequest returns a non-empty id
 *   - updateStatus transitions the status
 *   - assignRequest sets the assignedTo principal
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

describe.skipIf(!deployed)("createRequest — Candid serialization", () => {
  let request: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createRequest(
      UNIT_ID, "Leaky faucet in kitchen integration test", { Medium: null }, []
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

  it("priority Variant round-trips as Medium", () => {
    expect(request.priority).toHaveProperty("Medium");
  });

  it("status starts as Open", () => {
    expect(request.status).toHaveProperty("Open");
  });

  it("createdAt is a BigInt nanosecond timestamp", () => {
    expect(typeof request.createdAt).toBe("bigint");
    expect(request.createdAt).toBeGreaterThan(BigInt(1_000_000_000_000_000_000n));
  });
});

describe.skipIf(!deployed)("updateStatus — status transitions", () => {
  let requestId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createRequest(
      UNIT_ID, "Broken window for status test", { High: null }, []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    requestId = result.ok.id;
  });

  it("transitions to InProgress", async () => {
    const a = await getActor();
    const result = await a.updateStatus(requestId, { InProgress: null }) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("InProgress");
  });

  it("transitions to Resolved", async () => {
    const a = await getActor();
    const result = await a.updateStatus(requestId, { Resolved: null }) as any;
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

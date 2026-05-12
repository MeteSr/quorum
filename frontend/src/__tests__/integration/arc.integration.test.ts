/**
 * Integration tests — ARC (Architectural Review Committee) canister.
 *
 * What these tests prove that unit tests cannot:
 *   - RequestType + RequestStatus Variant round-trips
 *   - photoHash + reviewNotes Opt(Text) serializes as [] correctly
 *   - submitRequest returns a non-empty id with Pending status
 *   - updateStatus transitions status and sets reviewNotes
 *   - getRequestsForUnit scopes results correctly
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/arc";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_ARC || "";
const deployed = !!CANISTER_ID;

const RUN_ID  = Date.now();
const UNIT_ID = `unit-arc-${RUN_ID}`;

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("submitRequest — Candid serialization", () => {
  let request: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.submitRequest(
      UNIT_ID, { Fence: null }, "Installing a 6-foot cedar fence on north side.", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    request = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(request.id).toBeTruthy();
  });

  it("RequestType Variant round-trips as Fence", () => {
    expect(request.requestType).toHaveProperty("Fence");
  });

  it("status starts as Pending", () => {
    expect(request.status).toHaveProperty("Pending");
  });

  it("photoHash is empty Opt ([])", () => {
    expect(request.photoHash).toEqual([]);
  });

  it("reviewNotes is empty Opt ([])", () => {
    expect(request.reviewNotes).toEqual([]);
  });
});

describe.skipIf(!deployed)("updateStatus — transitions and reviewNotes Opt", () => {
  let requestId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.submitRequest(
      UNIT_ID, { Deck: null }, "Adding a rear deck 12x16 ft.", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    requestId = result.ok.id;
  });

  it("transitions to UnderReview", async () => {
    const a = await getActor();
    const result = await a.updateStatus(requestId, { UnderReview: null }, []) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("UnderReview");
  });

  it("Approved with reviewNotes Opt populated", async () => {
    const a = await getActor();
    const result = await a.updateStatus(
      requestId, { Approved: null }, ["Approved — ensure HOA-compliant materials."]
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("Approved");
    expect(result.ok.reviewNotes).toHaveLength(1);
    expect(result.ok.reviewNotes[0]).toContain("Approved");
  });
});

describe.skipIf(!deployed)("getRequestsForUnit — entity scoping", () => {
  it("returns requests for the queried unit", async () => {
    const a = await getActor();
    const all = await a.getRequestsForUnit(UNIT_ID) as any[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r: any) => r.unitId === UNIT_ID)).toBe(true);
  });

  it("does not return requests for a different unit", async () => {
    const a = await getActor();
    const other = await a.getRequestsForUnit(`other-unit-${RUN_ID}`) as any[];
    expect(other.length).toBe(0);
  });
});

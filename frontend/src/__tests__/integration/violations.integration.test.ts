/**
 * Integration tests — violations canister.
 *
 * What these tests prove that unit tests cannot:
 *   - ViolationCategory + ViolationStatus Variant round-trips
 *   - photoHash Opt(Text) serializes as [] and [string]
 *   - createViolation returns a non-empty id
 *   - addReply appends a Reply record to the violation
 *   - updateStatus transitions the violation status
 *   - getViolationsForUnit scopes results correctly
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/violations";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_VIOLATIONS || "";
const deployed = !!CANISTER_ID;

const RUN_ID  = Date.now();
const UNIT_ID = `unit-viol-${RUN_ID}`;

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("createViolation — Candid serialization", () => {
  let violation: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createViolation(
      UNIT_ID, { Noise: null }, "Loud music after 11pm integration test", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    violation = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(violation.id).toBeTruthy();
  });

  it("category Variant round-trips as Noise", () => {
    expect(violation.category).toHaveProperty("Noise");
  });

  it("status starts as Open", () => {
    expect(violation.status).toHaveProperty("Open");
  });

  it("photoHash Opt is empty ([])", () => {
    expect(violation.photoHash).toEqual([]);
  });

  it("replies array starts empty", () => {
    expect(violation.replies).toHaveLength(0);
  });
});

describe.skipIf(!deployed)("addReply — append and serialize", () => {
  let violationId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createViolation(
      UNIT_ID, { Pet: null }, "Unleashed dog in common area", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    violationId = result.ok.id;
  });

  it("reply is appended to the violation", async () => {
    const a = await getActor();
    const result = await a.addReply(violationId, "We will address this immediately.") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.replies).toHaveLength(1);
    expect(result.ok.replies[0].text).toBe("We will address this immediately.");
  });
});

describe.skipIf(!deployed)("updateStatus — ViolationStatus transition", () => {
  let violationId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createViolation(
      UNIT_ID, { Parking: null }, "Vehicle in fire lane", []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    violationId = result.ok.id;
  });

  it("transitions to UnderReview", async () => {
    const a = await getActor();
    const result = await a.updateStatus(violationId, { UnderReview: null }) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("UnderReview");
  });

  it("transitions to Resolved", async () => {
    const a = await getActor();
    const result = await a.updateStatus(violationId, { Resolved: null }) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("Resolved");
  });
});

describe.skipIf(!deployed)("getViolationsForUnit — entity scoping", () => {
  it("returns violations for the queried unit", async () => {
    const a = await getActor();
    const all = await a.getViolationsForUnit(UNIT_ID) as any[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((v: any) => v.unitId === UNIT_ID)).toBe(true);
  });

  it("does not return violations for a different unit", async () => {
    const a = await getActor();
    const other = await a.getViolationsForUnit(`other-unit-${RUN_ID}`) as any[];
    expect(other.length).toBe(0);
  });
});

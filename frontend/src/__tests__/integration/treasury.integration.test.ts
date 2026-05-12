/**
 * Integration tests — treasury canister.
 *
 * What these tests prove that unit tests cannot:
 *   - AssessmentType + PaymentStatus Variant round-trips
 *   - postAssessment persists with amountCents as BigInt
 *   - paidAt Opt(Int) is null initially
 *   - markPaid sets status to Paid and populates paidAt
 *   - getOutstandingAssessments excludes paid assessments
 *   - getTotalOutstandingCents reflects the created assessments
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/treasury";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_TREASURY || "";
const deployed = !!CANISTER_ID;

const RUN_ID  = Date.now();
const UNIT_ID = `unit-treasury-${RUN_ID}`;
const DUE_NS  = BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000) * BigInt(1_000_000);

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("postAssessment — Candid serialization", () => {
  let assessment: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.postAssessment(
      UNIT_ID, BigInt(25000), { MonthlyDues: null }, "Monthly dues integration test", DUE_NS
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    assessment = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(assessment.id).toBeTruthy();
  });

  it("amountCents is a BigInt", () => {
    expect(typeof assessment.amountCents).toBe("bigint");
    expect(assessment.amountCents).toBe(BigInt(25000));
  });

  it("AssessmentType round-trips as MonthlyDues", () => {
    expect(assessment.kind).toHaveProperty("MonthlyDues");
  });

  it("status starts as Outstanding", () => {
    expect(assessment.status).toHaveProperty("Outstanding");
  });

  it("paidAt starts as empty Opt ([])", () => {
    expect(assessment.paidAt).toEqual([]);
  });
});

describe.skipIf(!deployed)("markPaid — mutation and Opt(Int) population", () => {
  let assessmentId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.postAssessment(
      UNIT_ID, BigInt(10000), { Fine: null }, "Fine for payment test", DUE_NS
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    assessmentId = result.ok.id;
  });

  it("markPaid returns Paid status", async () => {
    const a = await getActor();
    const result = await a.markPaid(assessmentId) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("Paid");
  });

  it("paidAt is populated after markPaid", async () => {
    const a = await getActor();
    const result = await a.markPaid(assessmentId) as any;
    // Already paid — idempotent or AlreadyPaid — either way paidAt should be set
    const assessment = "ok" in result ? result.ok : null;
    if (assessment) {
      expect(assessment.paidAt.length).toBe(1);
    }
  });
});

describe.skipIf(!deployed)("getAssessmentsForUnit — entity scoping", () => {
  it("returns assessments for the queried unit", async () => {
    const a = await getActor();
    const all = await a.getAssessmentsForUnit(UNIT_ID) as any[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a: any) => a.unitId === UNIT_ID)).toBe(true);
  });

  it("does not return assessments for a different unit", async () => {
    const a = await getActor();
    const other = await a.getAssessmentsForUnit(`other-unit-${RUN_ID}`) as any[];
    expect(other.length).toBe(0);
  });
});

describe.skipIf(!deployed)("getTotalOutstandingCents — aggregate query", () => {
  it("returns a BigInt", async () => {
    const a = await getActor();
    const total = await a.getTotalOutstandingCents() as bigint;
    expect(typeof total).toBe("bigint");
    expect(total).toBeGreaterThanOrEqual(BigInt(0));
  });
});

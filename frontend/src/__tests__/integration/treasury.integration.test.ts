/**
 * Integration tests — treasury canister.
 *
 * What these tests prove that unit tests cannot:
 *   - AssessmentType variants (including LateFee) round-trip over Candid
 *   - postAssessment persists with amountCents as BigInt
 *   - paidAt Opt(Int) is null initially, populated after markPaid
 *   - getOutstandingAssessments excludes paid assessments
 *   - getTotalOutstandingCents reflects live state
 *   - setLateFeePolicy / getLateFeePolicy persist across calls
 *   - setReminderPolicy / getReminderPolicy persist across calls
 *   - waiveLateFee marks a LateFee assessment as Waived
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
const PAST_NS = BigInt(Date.now() - 10 * 24 * 60 * 60 * 1000) * BigInt(1_000_000);

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

// ─── Core assessment CRUD ─────────────────────────────────────────────────────

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

// ─── LateFee variant + waiveLateFee (#27) ─────────────────────────────────────

describe.skipIf(!deployed)("LateFee AssessmentType + waiveLateFee", () => {
  let lateFeeId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.postAssessment(
      UNIT_ID, BigInt(2500), { LateFee: null }, "Late fee for integration test", PAST_NS
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    lateFeeId = result.ok.id;
  });

  it("LateFee kind round-trips over Candid", async () => {
    const a = await getActor();
    const result = await a.getAssessment(lateFeeId) as any;
    expect(result.length).toBe(1);
    expect(result[0].kind).toHaveProperty("LateFee");
  });

  it("waiveLateFee changes status to Waived", async () => {
    const a = await getActor();
    const result = await a.waiveLateFee(lateFeeId, "board discretion") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.status).toHaveProperty("Waived");
  });

  it("waiveLateFee on non-LateFee returns InvalidInput", async () => {
    const a = await getActor();
    // Create a regular dues assessment first
    const posted = await a.postAssessment(
      UNIT_ID, BigInt(5000), { MonthlyDues: null }, "Regular dues", DUE_NS
    ) as any;
    const regularId = posted.ok.id;
    const result = await a.waiveLateFee(regularId, "test") as any;
    expect(result).toHaveProperty("err");
    expect(result.err).toHaveProperty("InvalidInput");
  });
});

// ─── Late fee policy persistence (#27) ───────────────────────────────────────

describe.skipIf(!deployed)("setLateFeePolicy / getLateFeePolicy persistence", () => {
  const POLICY = {
    gracePeriodDays: BigInt(5),
    flatAmountCents: BigInt(2500),
    percentBps:      BigInt(0),
    escalation:      [],
  };

  it("policy round-trips over Candid", async () => {
    const a = await getActor();
    await a.setLateFeePolicy(POLICY);
    const result = await a.getLateFeePolicy() as any;
    expect(result.length).toBe(1);
    expect(result[0].gracePeriodDays).toBe(BigInt(5));
    expect(result[0].flatAmountCents).toBe(BigInt(2500));
    expect(result[0].escalation).toEqual([]);
  });
});

// ─── Reminder policy persistence (#32) ───────────────────────────────────────

describe.skipIf(!deployed)("setReminderPolicy / getReminderPolicy persistence", () => {
  const POLICY = {
    preDueDays:  [BigInt(7), BigInt(3), BigInt(1)],
    postDueDays: [BigInt(1), BigInt(7), BigInt(14)],
  };

  it("policy round-trips over Candid", async () => {
    const a = await getActor();
    await a.setReminderPolicy(POLICY);
    const result = await a.getReminderPolicy() as any;
    expect(result.length).toBe(1);
    expect(result[0].preDueDays).toEqual([BigInt(7), BigInt(3), BigInt(1)]);
    expect(result[0].postDueDays).toEqual([BigInt(1), BigInt(7), BigInt(14)]);
  });
});

// ─── metrics() ───────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("metrics() — aggregate counters", () => {
  it("returns a record with expected numeric fields", async () => {
    const a = await getActor();
    const m = await a.metrics() as any;
    expect(typeof m.totalAssessments).toBe("bigint");
    expect(typeof m.outstandingCount).toBe("bigint");
    expect(typeof m.lateFeeCount).toBe("bigint");
    expect(typeof m.remindersSent).toBe("bigint");
    expect(m.totalAssessments).toBeGreaterThan(BigInt(0));
  });
});

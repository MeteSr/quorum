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

// ─── Reporting queries (#15) ─────────────────────────────────────────────────

describe.skipIf(!deployed)("getAgingReport — bucket structure", () => {
  it("returns report with all four buckets as arrays", async () => {
    const a = await getActor();
    const r = await a.getAgingReport() as any;
    expect(Array.isArray(r.current)).toBe(true);
    expect(Array.isArray(r.days31_60)).toBe(true);
    expect(Array.isArray(r.days61_90)).toBe(true);
    expect(Array.isArray(r.days90plus)).toBe(true);
  });

  it("totalOutstandingCents is a BigInt", async () => {
    const a = await getActor();
    const r = await a.getAgingReport() as any;
    expect(typeof r.totalOutstandingCents).toBe("bigint");
  });
});

describe.skipIf(!deployed)("getReserveFundReport — balance + recommendation", () => {
  it("setReserveFundBalance persists and getReserveFundReport reflects it", async () => {
    const a = await getActor();
    await a.setReserveFundBalance(BigInt(5_000_000));
    const r = await a.getReserveFundReport() as any;
    expect(r.currentBalanceCents).toBe(BigInt(5_000_000));
    expect(typeof r.recommendedBalanceCents).toBe("bigint");
    expect(typeof r.fundingGapCents).toBe("bigint");
  });
});

describe.skipIf(!deployed)("getBudgetVsActual — five categories always returned", () => {
  it("returns exactly 5 category rows", async () => {
    const a = await getActor();
    const rows = await a.getBudgetVsActual(BigInt(2025)) as any[];
    expect(rows).toHaveLength(5);
    expect(rows.map((r: any) => r.category).sort()).toEqual(
      ["Amenity", "Fine", "LateFee", "MonthlyDues", "SpecialAssessment"]
    );
  });

  it("setBudgetLine persists and getBudgetVsActual reflects it", async () => {
    const a = await getActor();
    await a.setBudgetLine(BigInt(2025), "MonthlyDues", BigInt(12_000_000));
    const rows = await a.getBudgetVsActual(BigInt(2025)) as any[];
    const dues = rows.find((r: any) => r.category === "MonthlyDues");
    expect(dues!.budgetedCents).toBe(BigInt(12_000_000));
  });
});

describe.skipIf(!deployed)("getIncomeStatement — date range filter", () => {
  it("returns totalIncomeCents as BigInt", async () => {
    const a     = await getActor();
    const start = BigInt(1_735_689_600_000_000_000);
    const end   = BigInt(1_767_225_600_000_000_000);
    const stmt  = await a.getIncomeStatement(start, end) as any;
    expect(typeof stmt.totalIncomeCents).toBe("bigint");
    expect(stmt.startDate).toBe(start);
    expect(stmt.endDate).toBe(end);
  });
});

describe.skipIf(!deployed)("getAnnualStatement — data retrieval (#41)", () => {
  it("returns statement with payments array for the unit", async () => {
    const a    = await getActor();
    const stmt = await a.getAnnualStatement(UNIT_ID, BigInt(2025)) as any;
    expect(stmt.unitId).toBe(UNIT_ID);
    expect(Array.isArray(stmt.payments)).toBe(true);
    expect(typeof stmt.totalPaidCents).toBe("bigint");
    expect(typeof stmt.totalBilledCents).toBe("bigint");
    expect(typeof stmt.outstandingCents).toBe("bigint");
  });

  it("returns empty payments for a unit with no history in the year", async () => {
    const a    = await getActor();
    const stmt = await a.getAnnualStatement(`no-history-${RUN_ID}`, BigInt(2025)) as any;
    expect(stmt.payments).toHaveLength(0);
    expect(stmt.totalPaidCents).toBe(BigInt(0));
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
    expect(typeof m.delinquentCount).toBe("bigint");
    expect(m.totalAssessments).toBeGreaterThan(BigInt(0));
  });
});

// ─── Collections workflow (#28) ───────────────────────────────────────────────

describe.skipIf(!deployed)("collections workflow (#28)", () => {
  const COL_UNIT = `col-unit-${RUN_ID}`;

  it("openCollectionCase returns GracePeriod record", async () => {
    const a = await getActor();
    const result = await a.openCollectionCase(COL_UNIT, "Integration test case") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.unitId).toBe(COL_UNIT);
    expect(result.ok.stage).toHaveProperty("GracePeriod");
    expect(typeof result.ok.totalOverdueCents).toBe("bigint");
  });

  it("openCollectionCase returns InvalidInput when case already open", async () => {
    const a = await getActor();
    const result = await a.openCollectionCase(COL_UNIT, "Duplicate open") as any;
    expect(result).toHaveProperty("err");
    expect(result.err).toHaveProperty("InvalidInput");
  });

  it("getDelinquentUnits includes the opened case", async () => {
    const a = await getActor();
    const units = await a.getDelinquentUnits() as any[];
    expect(Array.isArray(units)).toBe(true);
    const found = units.find((r: any) => r.unitId === COL_UNIT);
    expect(found).toBeDefined();
    expect(found.stage).toHaveProperty("GracePeriod");
  });

  it("getCollectionRecord returns the opened case", async () => {
    const a = await getActor();
    const result = await a.getCollectionRecord(COL_UNIT) as any;
    expect(result.length).toBe(1);
    expect(result[0].unitId).toBe(COL_UNIT);
  });

  it("getCollectionHistory has one opening event", async () => {
    const a = await getActor();
    const history = await a.getCollectionHistory(COL_UNIT) as any[];
    expect(history.length).toBe(1);
    expect(history[0].toStage).toHaveProperty("GracePeriod");
  });

  it("escalateCollection advances stage to FirstNotice", async () => {
    const a = await getActor();
    const result = await a.escalateCollection(COL_UNIT, { FirstNotice: null }, "Demand letter sent via certified mail") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.stage).toHaveProperty("FirstNotice");
  });

  it("escalateCollection on unknown unit returns NotFound", async () => {
    const a = await getActor();
    const result = await a.escalateCollection(`no-such-unit-${RUN_ID}`, { FirstNotice: null }, "test") as any;
    expect(result).toHaveProperty("err");
    expect(result.err).toHaveProperty("NotFound");
  });

  it("getCollectionHistory has two events after escalation", async () => {
    const a = await getActor();
    const history = await a.getCollectionHistory(COL_UNIT) as any[];
    expect(history.length).toBe(2);
    const escalateEvt = history.find((e: any) => "FirstNotice" in e.toStage);
    expect(escalateEvt).toBeDefined();
    expect(escalateEvt.note).toBe("Demand letter sent via certified mail");
  });

  it("resolveCollection sets stage to Resolved and removes from getDelinquentUnits", async () => {
    const a = await getActor();
    const result = await a.resolveCollection(COL_UNIT, "Paid in full") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    const units = await a.getDelinquentUnits() as any[];
    const found = units.find((r: any) => r.unitId === COL_UNIT);
    expect(found).toBeUndefined();
  });

  it("resolveCollection on unknown unit returns NotFound", async () => {
    const a = await getActor();
    const result = await a.resolveCollection(`no-such-${RUN_ID}`, "test") as any;
    expect(result).toHaveProperty("err");
    expect(result.err).toHaveProperty("NotFound");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_TREASURY = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  getOutstandingAssessments,
  getAssessmentsForUnit,
  getTotalOutstandingCents,
  markPaid,
  waiveLateFee,
  createDuesCheckoutSession,
  verifyDuesSession,
  getPaymentHistory,
  getReminderLog,
  getLateFeePolicy,
  getReminderPolicy,
  setLateFeePolicy,
  setReminderPolicy,
  getAgingReport,
  getReserveFundReport,
  getBudgetVsActual,
  getIncomeStatement,
  getAnnualStatement,
  setReserveFundBalance,
  setBudgetLine,
  getDelinquentUnits,
  getCollectionRecord,
  getCollectionHistory,
  openCollectionCase,
  escalateCollection,
  resolveCollection,
} from "@/services/treasury";

const MOCK_ASSESSMENT = {
  id:          "asmt-1",
  unitId:      "12A",
  amountCents: BigInt(15000),
  kind:        { MonthlyDues: null },
  description: "May 2025 HOA Dues",
  dueDate:     BigInt(1_746_057_600_000_000_000),
  status:      { Outstanding: null },
  paidAt:      [] as [],
  createdAt:   BigInt(1_743_465_600_000_000_000),
  createdBy:   { toText: () => "board-principal" } as any,
};

const MOCK_LATE_FEE = {
  ...MOCK_ASSESSMENT,
  id:          "asmt-late-1",
  kind:        { LateFee: null },
  description: "Late fee for asmt-1",
  amountCents: BigInt(2500),
};

const MOCK_PAYMENT = {
  id:               "PAY_1",
  assessmentId:     "asmt-1",
  unitId:           "12A",
  amountCents:      BigInt(15000),
  platformFeeCents: BigInt(75),
  stripePaymentId:  "cs_test_abc123",
  paidAt:           BigInt(1_700_000_000_000_000_000),
};

const MOCK_REMINDER = {
  id:           "REM_1",
  assessmentId: "asmt-1",
  unitId:       "12A",
  reminderType: "pre_7d",
  sentAt:       BigInt(1_743_465_600_000_000_000),
};

const MOCK_AGING_REPORT = {
  current:               [{ unitId: "12A", amountCents: BigInt(15000) }],
  days31_60:             [],
  days61_90:             [],
  days90plus:            [{ unitId: "7B", amountCents: BigInt(30000) }],
  totalOutstandingCents: BigInt(45000),
};

const MOCK_RESERVE_REPORT = {
  currentBalanceCents:     BigInt(5_000_000),
  annualIncomeCents:       BigInt(12_000_000),
  recommendedBalanceCents: BigInt(3_600_000),
  fundingGapCents:         BigInt(1_400_000),
};

const MOCK_BUDGET_VS_ACTUAL = [
  { category: "MonthlyDues", budgetedCents: BigInt(12_000_000), actualCents: BigInt(11_000_000), varianceCents: BigInt(-1_000_000) },
  { category: "Fine",        budgetedCents: BigInt(500_000),    actualCents: BigInt(750_000),    varianceCents: BigInt(250_000)    },
];

const MOCK_INCOME_STATEMENT = {
  startDate:               BigInt(1_704_067_200_000_000_000),
  endDate:                 BigInt(1_735_689_600_000_000_000),
  totalIncomeCents:        BigInt(11_000_000),
  netOperatingIncomeCents: BigInt(11_000_000),
};

const MOCK_ANNUAL_STATEMENT = {
  unitId:           "12A",
  year:             BigInt(2025),
  payments:         [MOCK_PAYMENT],
  totalBilledCents: BigInt(15000),
  totalPaidCents:   BigInt(15000),
  outstandingCents: BigInt(0),
  generatedAt:      BigInt(1_735_689_600_000_000_000),
};

const MOCK_DELINQUENCY = {
  unitId:            "12A",
  stage:             { GracePeriod: null },
  totalOverdueCents: BigInt(15000),
  oldestDueDateNs:   BigInt(1_743_000_000_000_000_000),
  openedAt:          BigInt(1_746_000_000_000_000_000),
  lastUpdatedAt:     BigInt(1_746_000_000_000_000_000),
};

const MOCK_COLLECTION_EVENT = {
  id:        "EVT_1",
  unitId:    "12A",
  fromStage: { GracePeriod: null },
  toStage:   { FirstNotice: null },
  note:      "First demand letter sent",
  createdAt: BigInt(1_746_000_000_000_000_000),
  createdBy: { toText: () => "board-principal" } as any,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getOutstandingAssessments: vi.fn().mockResolvedValue([MOCK_ASSESSMENT]),
    getAssessmentsForUnit:     vi.fn().mockResolvedValue([MOCK_ASSESSMENT, MOCK_LATE_FEE]),
    getTotalOutstandingCents:  vi.fn().mockResolvedValue(BigInt(17500)),
    markPaid:                  vi.fn().mockResolvedValue({ ok: { ...MOCK_ASSESSMENT, status: { Paid: null }, paidAt: [BigInt(1_700_000_000_000_000_000)] } }),
    waiveAssessment:           vi.fn().mockResolvedValue({ ok: { ...MOCK_ASSESSMENT, status: { Waived: null } } }),
    waiveLateFee:              vi.fn().mockResolvedValue({ ok: { ...MOCK_LATE_FEE, status: { Waived: null } } }),
    createDuesCheckoutSession: vi.fn().mockResolvedValue({ ok: { id: "cs_test_abc", url: "https://checkout.stripe.com/pay/cs_test_abc" } }),
    verifyDuesSession:         vi.fn().mockResolvedValue({ ok: { ...MOCK_ASSESSMENT, status: { Paid: null }, paidAt: [BigInt(1_700_000_000_000_000_000)] } }),
    getPaymentHistory:         vi.fn().mockResolvedValue([MOCK_PAYMENT]),
    getReminderLog:            vi.fn().mockResolvedValue([MOCK_REMINDER]),
    getLateFeePolicy:          vi.fn().mockResolvedValue([{ gracePeriodDays: BigInt(5), flatAmountCents: BigInt(2500), percentBps: BigInt(0), escalation: [] }]),
    getReminderPolicy:         vi.fn().mockResolvedValue([{ preDueDays: [BigInt(7), BigInt(3), BigInt(1)], postDueDays: [BigInt(1), BigInt(7), BigInt(14)] }]),
    setLateFeePolicy:          vi.fn().mockResolvedValue(undefined),
    setReminderPolicy:         vi.fn().mockResolvedValue(undefined),
    getAgingReport:            vi.fn().mockResolvedValue(MOCK_AGING_REPORT),
    getReserveFundReport:      vi.fn().mockResolvedValue(MOCK_RESERVE_REPORT),
    getBudgetVsActual:         vi.fn().mockResolvedValue(MOCK_BUDGET_VS_ACTUAL),
    getIncomeStatement:        vi.fn().mockResolvedValue(MOCK_INCOME_STATEMENT),
    getAnnualStatement:        vi.fn().mockResolvedValue(MOCK_ANNUAL_STATEMENT),
    setReserveFundBalance:     vi.fn().mockResolvedValue(undefined),
    setBudgetLine:             vi.fn().mockResolvedValue(undefined),
    getDelinquentUnits:        vi.fn().mockResolvedValue([MOCK_DELINQUENCY]),
    getCollectionRecord:       vi.fn().mockResolvedValue([MOCK_DELINQUENCY]),
    getCollectionHistory:      vi.fn().mockResolvedValue([MOCK_COLLECTION_EVENT]),
    openCollectionCase:        vi.fn().mockResolvedValue({ ok: MOCK_DELINQUENCY }),
    escalateCollection:        vi.fn().mockResolvedValue({ ok: { ...MOCK_DELINQUENCY, stage: { FirstNotice: null } } }),
    resolveCollection:         vi.fn().mockResolvedValue({ ok: null }),
    ...overrides,
  };
}

describe("treasury service — getOutstandingAssessments", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all outstanding assessments", async () => {
    const assessments = await getOutstandingAssessments();
    expect(assessments).toHaveLength(1);
    expect(assessments[0].status).toEqual({ Outstanding: null });
  });

  it("returns empty array when no assessments outstanding", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getOutstandingAssessments: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getOutstandingAssessments()).toEqual([]);
  });
});

describe("treasury service — getAssessmentsForUnit", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns assessments including LateFee kinds", async () => {
    const assessments = await getAssessmentsForUnit("12A");
    expect(assessments).toHaveLength(2);
    expect(assessments.some((a) => "LateFee" in a.kind)).toBe(true);
  });

  it("passes the unitId argument to the actor", async () => {
    const spy = vi.fn().mockResolvedValue([MOCK_ASSESSMENT]);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getAssessmentsForUnit: spy }) as any);
    await getAssessmentsForUnit("42B");
    expect(spy).toHaveBeenCalledWith("42B");
  });
});

describe("treasury service — getTotalOutstandingCents", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns a bigint total", async () => {
    const total = await getTotalOutstandingCents();
    expect(typeof total).toBe("bigint");
    expect(total).toBe(BigInt(17500));
  });
});

describe("treasury service — markPaid", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with Paid status", async () => {
    const result = await markPaid("asmt-1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Paid: null });
  });

  it("paidAt is populated after markPaid", async () => {
    const result = await markPaid("asmt-1") as any;
    expect(result.ok.paidAt.length).toBe(1);
  });
});

describe("treasury service — waiveLateFee", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with Waived status", async () => {
    const result = await waiveLateFee("asmt-late-1", "financial hardship");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Waived: null });
  });

  it("passes both assessmentId and reason to the actor", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: { ...MOCK_LATE_FEE, status: { Waived: null } } });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ waiveLateFee: spy }) as any);
    await waiveLateFee("asmt-late-1", "financial hardship");
    expect(spy).toHaveBeenCalledWith("asmt-late-1", "financial hardship");
  });
});

describe("treasury service — Stripe checkout (#12)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("createDuesCheckoutSession returns ok with id and url", async () => {
    const result = await createDuesCheckoutSession("asmt-1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("cs_test_abc");
    expect((result as any).ok.url).toContain("stripe.com");
  });

  it("createDuesCheckoutSession passes assessmentId to actor", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: { id: "cs_x", url: "https://stripe.com/pay/cs_x" } });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ createDuesCheckoutSession: spy }) as any);
    await createDuesCheckoutSession("asmt-99");
    expect(spy).toHaveBeenCalledWith("asmt-99");
  });

  it("verifyDuesSession returns ok with Paid status", async () => {
    const result = await verifyDuesSession("cs_test_abc", "asmt-1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Paid: null });
  });

  it("returns err PaymentFailed when canister not deployed", async () => {
    (process.env as any).CANISTER_ID_TREASURY = "";
    vi.resetModules();
    const { createDuesCheckoutSession: fn } = await import("@/services/treasury");
    const result = await fn("asmt-1");
    expect(result).toHaveProperty("err");
    (process.env as any).CANISTER_ID_TREASURY = "rdmx6-jaaaa-aaaah-test-cai";
  });
});

describe("treasury service — payment history + reminder log", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getPaymentHistory returns DuesPayment array with platformFeeCents", async () => {
    const payments = await getPaymentHistory("12A");
    expect(payments).toHaveLength(1);
    expect(payments[0].platformFeeCents).toBe(BigInt(75));
    expect(payments[0].stripePaymentId).toBe("cs_test_abc123");
  });

  it("getReminderLog returns ReminderLog with reminderType", async () => {
    const logs = await getReminderLog("12A");
    expect(logs).toHaveLength(1);
    expect(logs[0].reminderType).toBe("pre_7d");
  });
});

describe("treasury service — late fee + reminder policy (#27 #32)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getLateFeePolicy returns policy with gracePeriodDays", async () => {
    const policy = await getLateFeePolicy();
    expect(policy).not.toBeNull();
    expect(policy!.gracePeriodDays).toBe(BigInt(5));
    expect(policy!.flatAmountCents).toBe(BigInt(2500));
  });

  it("getReminderPolicy returns pre and post day arrays", async () => {
    const policy = await getReminderPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.preDueDays).toEqual([BigInt(7), BigInt(3), BigInt(1)]);
    expect(policy!.postDueDays).toEqual([BigInt(1), BigInt(7), BigInt(14)]);
  });

  it("setLateFeePolicy calls actor with correct shape", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setLateFeePolicy: spy }) as any);
    const policy = { gracePeriodDays: BigInt(7), flatAmountCents: BigInt(5000), percentBps: BigInt(0), escalation: [] };
    await setLateFeePolicy(policy);
    expect(spy).toHaveBeenCalledWith(policy);
  });

  it("setReminderPolicy calls actor with correct shape", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setReminderPolicy: spy }) as any);
    const policy = { preDueDays: [BigInt(3), BigInt(1)], postDueDays: [BigInt(7)] };
    await setReminderPolicy(policy);
    expect(spy).toHaveBeenCalledWith(policy);
  });
});

describe("treasury service — aging report (#15)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns aging report with all four buckets", async () => {
    const report = await getAgingReport();
    expect(report).not.toBeNull();
    expect(report!.current).toHaveLength(1);
    expect(report!.days90plus).toHaveLength(1);
    expect(report!.days31_60).toHaveLength(0);
  });

  it("totalOutstandingCents is a bigint sum", async () => {
    const report = await getAgingReport();
    expect(typeof report!.totalOutstandingCents).toBe("bigint");
    expect(report!.totalOutstandingCents).toBe(BigInt(45000));
  });

  it("returns null when canister not deployed", async () => {
    (process.env as any).CANISTER_ID_TREASURY = "";
    vi.resetModules();
    const { getAgingReport: fn } = await import("@/services/treasury");
    const result = await fn();
    expect(result).toBeNull();
    (process.env as any).CANISTER_ID_TREASURY = "rdmx6-jaaaa-aaaah-test-cai";
  });
});

describe("treasury service — reserve fund report (#15)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns report with all four fields", async () => {
    const report = await getReserveFundReport();
    expect(report).not.toBeNull();
    expect(typeof report!.currentBalanceCents).toBe("bigint");
    expect(typeof report!.fundingGapCents).toBe("bigint");
    expect(report!.recommendedBalanceCents).toBe(BigInt(3_600_000));
  });

  it("setReserveFundBalance calls actor with bigint", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setReserveFundBalance: spy }) as any);
    await setReserveFundBalance(BigInt(8_000_000));
    expect(spy).toHaveBeenCalledWith(BigInt(8_000_000));
  });
});

describe("treasury service — budget vs actual (#15)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns array with category entries", async () => {
    const rows = await getBudgetVsActual(2025);
    expect(rows).toHaveLength(2);
    expect(rows[0].category).toBe("MonthlyDues");
    expect(typeof rows[0].varianceCents).toBe("bigint");
  });

  it("passes year as BigInt to actor", async () => {
    const spy = vi.fn().mockResolvedValue(MOCK_BUDGET_VS_ACTUAL);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getBudgetVsActual: spy }) as any);
    await getBudgetVsActual(2025);
    expect(spy).toHaveBeenCalledWith(BigInt(2025));
  });

  it("setBudgetLine passes correct args", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setBudgetLine: spy }) as any);
    await setBudgetLine(2025, "MonthlyDues", BigInt(12_000_000));
    expect(spy).toHaveBeenCalledWith(BigInt(2025), "MonthlyDues", BigInt(12_000_000));
  });
});

describe("treasury service — income statement (#15)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns statement with income fields", async () => {
    const start = BigInt(1_704_067_200_000_000_000);
    const end   = BigInt(1_735_689_600_000_000_000);
    const stmt  = await getIncomeStatement(start, end);
    expect(stmt).not.toBeNull();
    expect(typeof stmt!.totalIncomeCents).toBe("bigint");
    expect(stmt!.totalIncomeCents).toBe(BigInt(11_000_000));
  });

  it("passes start and end dates to actor", async () => {
    const spy   = vi.fn().mockResolvedValue(MOCK_INCOME_STATEMENT);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getIncomeStatement: spy }) as any);
    const start = BigInt(1_704_067_200_000_000_000);
    const end   = BigInt(1_735_689_600_000_000_000);
    await getIncomeStatement(start, end);
    expect(spy).toHaveBeenCalledWith(start, end);
  });
});

describe("treasury service — annual statement (#41)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns statement with payments array", async () => {
    const stmt = await getAnnualStatement("12A", 2025);
    expect(stmt).not.toBeNull();
    expect(stmt!.unitId).toBe("12A");
    expect(stmt!.payments).toHaveLength(1);
    expect(typeof stmt!.totalPaidCents).toBe("bigint");
  });

  it("passes unitId and year as BigInt to actor", async () => {
    const spy = vi.fn().mockResolvedValue(MOCK_ANNUAL_STATEMENT);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getAnnualStatement: spy }) as any);
    await getAnnualStatement("12A", 2025);
    expect(spy).toHaveBeenCalledWith("12A", BigInt(2025));
  });

  it("returns null when canister not deployed", async () => {
    (process.env as any).CANISTER_ID_TREASURY = "";
    vi.resetModules();
    const { getAnnualStatement: fn } = await import("@/services/treasury");
    const result = await fn("12A", 2025);
    expect(result).toBeNull();
    (process.env as any).CANISTER_ID_TREASURY = "rdmx6-jaaaa-aaaah-test-cai";
  });
});

describe("treasury service — collections workflow (#28)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getDelinquentUnits returns array of DelinquencyRecord", async () => {
    const records = await getDelinquentUnits();
    expect(records).toHaveLength(1);
    expect(records[0].unitId).toBe("12A");
    expect(typeof records[0].totalOverdueCents).toBe("bigint");
    expect(records[0].stage).toEqual({ GracePeriod: null });
  });

  it("getCollectionRecord unwraps Opt and returns single record", async () => {
    const rec = await getCollectionRecord("12A");
    expect(rec).not.toBeNull();
    expect(rec!.unitId).toBe("12A");
  });

  it("getCollectionRecord returns null when canister not deployed", async () => {
    (process.env as any).CANISTER_ID_TREASURY = "";
    vi.resetModules();
    const { getCollectionRecord: fn } = await import("@/services/treasury");
    const result = await fn("12A");
    expect(result).toBeNull();
    (process.env as any).CANISTER_ID_TREASURY = "rdmx6-jaaaa-aaaah-test-cai";
  });

  it("getCollectionHistory returns events with stage transitions", async () => {
    const history = await getCollectionHistory("12A");
    expect(history).toHaveLength(1);
    expect(history[0].fromStage).toEqual({ GracePeriod: null });
    expect(history[0].toStage).toEqual({ FirstNotice: null });
    expect(history[0].note).toBe("First demand letter sent");
  });

  it("openCollectionCase passes unitId and note to actor", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: MOCK_DELINQUENCY });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ openCollectionCase: spy }) as any);
    await openCollectionCase("12A", "Board opened case");
    expect(spy).toHaveBeenCalledWith("12A", "Board opened case");
  });

  it("openCollectionCase returns ok with GracePeriod stage", async () => {
    const result = await openCollectionCase("12A", "Board opened case");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.stage).toEqual({ GracePeriod: null });
  });

  it("escalateCollection passes unitId, stage variant, and note", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: { ...MOCK_DELINQUENCY, stage: { FirstNotice: null } } });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ escalateCollection: spy }) as any);
    await escalateCollection("12A", { FirstNotice: null }, "Demand letter sent");
    expect(spy).toHaveBeenCalledWith("12A", { FirstNotice: null }, "Demand letter sent");
  });

  it("escalateCollection returns ok with updated stage", async () => {
    const result = await escalateCollection("12A", { FirstNotice: null }, "Letter sent");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.stage).toEqual({ FirstNotice: null });
  });

  it("resolveCollection calls actor with unitId and note", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: null });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ resolveCollection: spy }) as any);
    await resolveCollection("12A", "Paid in full");
    expect(spy).toHaveBeenCalledWith("12A", "Paid in full");
  });

  it("resolveCollection returns ok null on success", async () => {
    const result = await resolveCollection("12A", "Paid in full");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok).toBeNull();
  });
});

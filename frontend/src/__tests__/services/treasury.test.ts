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

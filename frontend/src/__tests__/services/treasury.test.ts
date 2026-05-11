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

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getOutstandingAssessments: vi.fn().mockResolvedValue([MOCK_ASSESSMENT]),
    getAssessmentsForUnit:     vi.fn().mockResolvedValue([MOCK_ASSESSMENT]),
    getTotalOutstandingCents:  vi.fn().mockResolvedValue(BigInt(15000)),
    markPaid:                  vi.fn().mockResolvedValue({ ok: { ...MOCK_ASSESSMENT, status: { Paid: null }, paidAt: [BigInt(1_700_000_000_000_000_000)] } }),
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

  it("returns assessments for the given unit", async () => {
    const assessments = await getAssessmentsForUnit("12A");
    expect(assessments).toHaveLength(1);
    expect(assessments[0].unitId).toBe("12A");
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
    expect(total).toBe(BigInt(15000));
  });
});

describe("treasury service — markPaid", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated assessment showing Paid status", async () => {
    const result = await markPaid("asmt-1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Paid: null });
  });

  it("returns err when assessment is not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ markPaid: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await markPaid("bad-id");
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

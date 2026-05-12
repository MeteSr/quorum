import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_BENEFIT = "rdmx6-jaaaa-aaaah-benefit-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import { generateCoupon, getCoupon, redeemCoupon, getMetrics } from "@/services/benefit";

const MOCK_COUPON = {
  code:        "QUORUM-000001",
  issuedAt:    BigInt(1_700_000_000_000_000_000),
  redeemedAt:  [] as [],
};

const MOCK_COUPON_REDEEMED = {
  ...MOCK_COUPON,
  redeemedAt: [BigInt(1_700_000_001_000_000_000)] as [bigint],
};

const MOCK_METRICS = {
  totalIssued:   BigInt(42),
  totalRedeemed: BigInt(7),
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    generateCoupon: vi.fn().mockResolvedValue({ ok: MOCK_COUPON }),
    getCoupon:      vi.fn().mockResolvedValue([MOCK_COUPON]),
    redeemCoupon:   vi.fn().mockResolvedValue({ ok: MOCK_COUPON_REDEEMED }),
    metrics:        vi.fn().mockResolvedValue(MOCK_METRICS),
    ...overrides,
  };
}

describe("benefit service — generateCoupon", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with a coupon record on first call", async () => {
    const result = await generateCoupon();
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.code).toBe("QUORUM-000001");
  });

  it("returns the same code on repeated calls (idempotent)", async () => {
    const r1 = await generateCoupon();
    const r2 = await generateCoupon();
    expect((r1 as any).ok.code).toBe((r2 as any).ok.code);
  });

  it("returns err NotAuthorized for anonymous callers", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ generateCoupon: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await generateCoupon();
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });

});

describe("benefit service — getCoupon", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the coupon when one has been issued", async () => {
    const result = await getCoupon();
    expect(result).not.toBeNull();
    expect(result!.code).toBe("QUORUM-000001");
  });

  it("returns null when no coupon has been issued yet", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getCoupon: vi.fn().mockResolvedValue([]) }) as any
    );
    const result = await getCoupon();
    expect(result).toBeNull();
  });
});

describe("benefit service — redeemCoupon", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with redeemedAt set after redemption", async () => {
    const result = await redeemCoupon("QUORUM-000001");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.redeemedAt).toHaveLength(1);
  });

  it("returns err AlreadyRedeemed if the code was already used", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ redeemCoupon: vi.fn().mockResolvedValue({ err: { AlreadyRedeemed: null } }) }) as any
    );
    const result = await redeemCoupon("QUORUM-000001");
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("AlreadyRedeemed");
  });

  it("returns err NotFound for an unknown code", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ redeemCoupon: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await redeemCoupon("QUORUM-BOGUS");
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("benefit service — getMetrics", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns total issued coupon count", async () => {
    const result = await getMetrics();
    expect(result).not.toBeNull();
    expect(result!.totalIssued).toBe(BigInt(42));
  });

  it("returns total redeemed coupon count", async () => {
    const result = await getMetrics();
    expect(result).not.toBeNull();
    expect(result!.totalRedeemed).toBe(BigInt(7));
  });
});

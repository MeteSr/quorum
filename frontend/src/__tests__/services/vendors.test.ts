import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_VENDORS = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  addVendor,
  updateVendor,
  removeVendor,
  addVendorReview,
  logJob,
  updateCOI,
  getVendor,
  getAllVendors,
  getVendorsByCategory,
  getJobsForVendor,
  getExpiringCOIs,
} from "@/services/vendors";

const NOW = BigInt(1_700_000_000_000_000_000);

const MOCK_COI: any = {
  documentId: [],
  expiryNs:   NOW + BigInt(60 * 86_400 * 1_000_000_000),
  uploadedAt: NOW,
};

const MOCK_VENDOR: any = {
  id:          "VND_1",
  name:        "ABC Plumbing & Drain",
  category:    { Plumbing: null },
  phone:       "555-111-2222",
  email:       "abc@plumbing.com",
  website:     "https://abcplumbing.com",
  notes:       "Reliable",
  reviewCount: BigInt(0),
  ratingSum:   BigInt(0),
  jobCount:    BigInt(0),
  coi:         [],
  addedBy:     { toText: () => "board-principal" } as any,
  createdAt:   NOW,
};

const MOCK_VENDOR_JOB: any = {
  id:          "JOB_1",
  vendorId:    "VND_1",
  description: "Main sewer line hydro-jet cleaning",
  completedAt: [],
  costCents:   [BigInt(75000)],
  notes:       "Completed without issues",
  loggedBy:    { toText: () => "board-principal" } as any,
  createdAt:   NOW,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    addVendor:            vi.fn().mockResolvedValue({ ok: MOCK_VENDOR }),
    updateVendor:         vi.fn().mockResolvedValue({ ok: { ...MOCK_VENDOR, phone: "555-111-9999" } }),
    removeVendor:         vi.fn().mockResolvedValue({ ok: null }),
    addVendorReview:      vi.fn().mockResolvedValue({ ok: { ...MOCK_VENDOR, reviewCount: BigInt(1), ratingSum: BigInt(4) } }),
    logJob:               vi.fn().mockResolvedValue({ ok: MOCK_VENDOR_JOB }),
    updateCOI:            vi.fn().mockResolvedValue({ ok: { ...MOCK_VENDOR, coi: [MOCK_COI] } }),
    getVendor:            vi.fn().mockResolvedValue([MOCK_VENDOR]),
    getAllVendors:         vi.fn().mockResolvedValue([MOCK_VENDOR]),
    getVendorsByCategory: vi.fn().mockResolvedValue([MOCK_VENDOR]),
    getJobsForVendor:     vi.fn().mockResolvedValue([MOCK_VENDOR_JOB]),
    getExpiringCOIs:      vi.fn().mockResolvedValue([{ ...MOCK_VENDOR, coi: [MOCK_COI] }]),
    ...overrides,
  };
}

describe("vendors service — addVendor", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the new vendor", async () => {
    const result = await addVendor("ABC Plumbing & Drain", { Plumbing: null }, "555-111-2222", "abc@plumbing.com", "", "");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("VND_1");
    expect((result as any).ok.name).toBe("ABC Plumbing & Drain");
  });

  it("returns err on empty name", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ addVendor: vi.fn().mockResolvedValue({ err: { InvalidInput: "name required" } }) }) as any
    );
    const result = await addVendor("", { Other: null }, "", "", "", "");
    expect((result as any).err).toHaveProperty("InvalidInput");
  });

  it("returns err when caller is anonymous", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ addVendor: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await addVendor("Name", { Other: null }, "", "", "", "");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("vendors service — updateVendor", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated fields", async () => {
    const result = await updateVendor("VND_1", "ABC Plumbing & Drain", "555-111-9999", "abc@plumbing.com", "", "");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.phone).toBe("555-111-9999");
  });

  it("returns err when vendor not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ updateVendor: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await updateVendor("VND_9999", "Name", "", "", "", "");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("vendors service — removeVendor", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok on successful removal", async () => {
    const result = await removeVendor("VND_1");
    expect(result).toHaveProperty("ok");
  });

  it("returns err when vendor not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ removeVendor: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await removeVendor("VND_9999");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("vendors service — addVendorReview", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated review counts", async () => {
    const result = await addVendorReview("VND_1", 4);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.reviewCount).toBe(BigInt(1));
    expect((result as any).ok.ratingSum).toBe(BigInt(4));
  });

  it("passes BigInt to actor", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await addVendorReview("VND_1", 5);
    expect(actor.addVendorReview).toHaveBeenCalledWith("VND_1", BigInt(5));
  });

  it("returns err for invalid stars", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ addVendorReview: vi.fn().mockResolvedValue({ err: { InvalidInput: "stars must be 1–5" } }) }) as any
    );
    const result = await addVendorReview("VND_1", 6);
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("vendors service — logJob", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the logged job", async () => {
    const result = await logJob("VND_1", "Hydro-jet cleaning", [], [BigInt(75000)], "");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("JOB_1");
    expect((result as any).ok.vendorId).toBe("VND_1");
  });

  it("returns err when vendor not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ logJob: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await logJob("VND_9999", "desc", [], [], "");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("vendors service — updateCOI", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with coi populated", async () => {
    const expiryNs = NOW + BigInt(60 * 86_400 * 1_000_000_000);
    const result = await updateCOI("VND_1", [], expiryNs);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.coi).toHaveLength(1);
    expect((result as any).ok.coi[0].expiryNs).toBe(MOCK_COI.expiryNs);
  });

  it("returns err when vendor not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ updateCOI: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await updateCOI("VND_9999", [], BigInt(0));
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("vendors service — getVendor", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the vendor when found", async () => {
    const result = await getVendor("VND_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("VND_1");
  });

  it("returns null when not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getVendor: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getVendor("VND_9999")).toBeNull();
  });
});

describe("vendors service — getAllVendors", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all vendors", async () => {
    const results = await getAllVendors();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("VND_1");
  });

  it("returns empty array when none exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllVendors: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllVendors()).toEqual([]);
  });
});

describe("vendors service — getVendorsByCategory", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns vendors matching the category", async () => {
    const results = await getVendorsByCategory({ Plumbing: null });
    expect(results).toHaveLength(1);
    expect(results[0].category).toEqual({ Plumbing: null });
  });

  it("returns empty array when no match", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getVendorsByCategory: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getVendorsByCategory({ Electrical: null })).toEqual([]);
  });
});

describe("vendors service — getJobsForVendor", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns jobs for the vendor", async () => {
    const results = await getJobsForVendor("VND_1");
    expect(results).toHaveLength(1);
    expect(results[0].vendorId).toBe("VND_1");
  });

  it("returns empty array for vendor with no jobs", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getJobsForVendor: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getJobsForVendor("VND_2")).toEqual([]);
  });
});

describe("vendors service — getExpiringCOIs", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns vendors with expiring COIs", async () => {
    const results = await getExpiringCOIs(90);
    expect(results).toHaveLength(1);
    expect(results[0].coi).toHaveLength(1);
  });

  it("passes BigInt(withinDays) to actor", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await getExpiringCOIs(30);
    expect(actor.getExpiringCOIs).toHaveBeenCalledWith(BigInt(30));
  });

  it("returns empty array when no COIs are expiring", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getExpiringCOIs: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getExpiringCOIs(7)).toEqual([]);
  });
});

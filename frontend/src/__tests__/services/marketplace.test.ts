import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_MARKETPLACE = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  createListing,
  editListing,
  deleteListing,
  markSold,
  removeListing,
  flagListing,
  getListings,
  getListingsByCategory,
  getListing,
  getMyListings,
  getFlaggedListings,
} from "@/services/marketplace";
import { Principal } from "@dfinity/principal";

const NOW    = BigInt(1_700_000_000_000_000_000);
const SELLER = Principal.fromText("2vxsx-fae");

const MOCK_LISTING: any = {
  id:          "LST_1",
  title:       "Barely used bike",
  description: "Trek mountain bike, 2022",
  category:    { ForSale: null },
  priceCents:  [BigInt(15000)],
  photos:      [],
  contactInfo: "unit7c@example.com",
  postedBy:    SELLER,
  unitId:      "7C",
  status:      { Active: null },
  isFlagged:   false,
  createdAt:   NOW,
  expiresAt:   NOW + BigInt(30 * 24 * 3_600_000_000_000),
};

const MOCK_FLAG: any = {
  id:        "FLG_1",
  listingId: "LST_1",
  flaggedBy: SELLER,
  reason:    "Spam",
  createdAt: NOW,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    createListing:         vi.fn().mockResolvedValue({ ok: MOCK_LISTING }),
    editListing:           vi.fn().mockResolvedValue({ ok: { ...MOCK_LISTING, title: "Updated bike" } }),
    deleteListing:         vi.fn().mockResolvedValue({ ok: null }),
    markSold:              vi.fn().mockResolvedValue({ ok: { ...MOCK_LISTING, status: { Sold: null } } }),
    removeListing:         vi.fn().mockResolvedValue({ ok: { ...MOCK_LISTING, status: { Removed: null } } }),
    flagListing:           vi.fn().mockResolvedValue({ ok: MOCK_FLAG }),
    getListings:           vi.fn().mockResolvedValue([MOCK_LISTING]),
    getListingsByCategory: vi.fn().mockResolvedValue([MOCK_LISTING]),
    getListing:            vi.fn().mockResolvedValue([MOCK_LISTING]),
    getMyListings:         vi.fn().mockResolvedValue([MOCK_LISTING]),
    getFlaggedListings:    vi.fn().mockResolvedValue([{ ...MOCK_LISTING, isFlagged: true }]),
    ...overrides,
  };
}

// ─── createListing ────────────────────────────────────────────────────────────

describe("marketplace service — createListing", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created listing", async () => {
    const result = await createListing("Barely used bike", "Trek mountain bike", { ForSale: null }, [15000], [], "unit7c@example.com", "7C", Date.now() + 86400000 * 30);
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.title).toBe("Barely used bike");
    expect(result.ok.id).toBe("LST_1");
  });

  it("passes priceCents as [bigint] when provided", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    const expires = 1_800_000_000_000;
    await createListing("Bike", "Desc", { ForSale: null }, [15000], [], "contact", "7C", expires);
    expect(actor.createListing).toHaveBeenCalledWith(
      "Bike", "Desc", { ForSale: null }, [BigInt(15000)], [], "contact", "7C", BigInt(expires)
    );
  });

  it("passes priceCents as [] when not provided", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    const expires = 1_800_000_000_000;
    await createListing("Bike", "Desc", { Free: null }, [], [], "contact", "7C", expires);
    expect(actor.createListing).toHaveBeenCalledWith(
      "Bike", "Desc", { Free: null }, [], [], "contact", "7C", BigInt(expires)
    );
  });

  it("returns err when canister not deployed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(null as any);
    const result = await createListing("Bike", "Desc", { ForSale: null }, [], [], "contact", "7C", 0);
    expect(result).toHaveProperty("err");
  });
});

// ─── editListing ──────────────────────────────────────────────────────────────

describe("marketplace service — editListing", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated listing", async () => {
    const result = await editListing("LST_1", "Updated bike", "Desc", [], [], "contact", 0);
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.title).toBe("Updated bike");
  });
});

// ─── deleteListing ────────────────────────────────────────────────────────────

describe("marketplace service — deleteListing", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok null", async () => {
    const result = await deleteListing("LST_1");
    expect(result).toHaveProperty("ok");
  });

  it("returns err when canister not deployed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(null as any);
    const result = await deleteListing("LST_1");
    expect(result).toHaveProperty("err");
  });
});

// ─── markSold ─────────────────────────────────────────────────────────────────

describe("marketplace service — markSold", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with Sold status", async () => {
    const result = await markSold("LST_1");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.status).toHaveProperty("Sold");
  });

  it("returns err on NotFound", async () => {
    const actor = makeMockActor({ markSold: vi.fn().mockResolvedValue({ err: { NotFound: null } }) });
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    const result = await markSold("MISSING");
    expect(result).toHaveProperty("err");
    if (!("err" in result)) return;
    expect(result.err).toHaveProperty("NotFound");
  });
});

// ─── removeListing ────────────────────────────────────────────────────────────

describe("marketplace service — removeListing", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with Removed status", async () => {
    const result = await removeListing("LST_1");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.status).toHaveProperty("Removed");
  });
});

// ─── flagListing ──────────────────────────────────────────────────────────────

describe("marketplace service — flagListing", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the flag record", async () => {
    const result = await flagListing("LST_1", "Spam");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.reason).toBe("Spam");
    expect(result.ok.listingId).toBe("LST_1");
  });
});

// ─── getListings ──────────────────────────────────────────────────────────────

describe("marketplace service — getListings", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns array of active listings", async () => {
    const result = await getListings();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].title).toBe("Barely used bike");
  });

  it("returns empty array when canister not deployed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(null as any);
    expect(await getListings()).toEqual([]);
  });
});

// ─── getListingsByCategory ───────────────────────────────────────────────────

describe("marketplace service — getListingsByCategory", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns listings for the given category", async () => {
    const result = await getListingsByCategory({ ForSale: null });
    expect(result.length).toBe(1);
    expect(result[0].category).toHaveProperty("ForSale");
  });
});

// ─── getListing ───────────────────────────────────────────────────────────────

describe("marketplace service — getListing", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the listing when found", async () => {
    const result = await getListing("LST_1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("LST_1");
  });

  it("returns null when not found", async () => {
    const actor = makeMockActor({ getListing: vi.fn().mockResolvedValue([]) });
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    expect(await getListing("MISSING")).toBeNull();
  });
});

// ─── getMyListings ────────────────────────────────────────────────────────────

describe("marketplace service — getMyListings", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns listings for the caller", async () => {
    const result = await getMyListings("2vxsx-fae");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("LST_1");
  });

  it("passes principal object to the actor", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await getMyListings("2vxsx-fae");
    expect(actor.getMyListings).toHaveBeenCalledWith(Principal.fromText("2vxsx-fae"));
  });
});

// ─── getFlaggedListings ───────────────────────────────────────────────────────

describe("marketplace service — getFlaggedListings", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns flagged listings", async () => {
    const result = await getFlaggedListings();
    expect(result.length).toBe(1);
    expect(result[0].isFlagged).toBe(true);
  });
});

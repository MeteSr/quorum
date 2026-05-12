import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_AMENITIES = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  createAmenity,
  updateAmenity,
  createReservation,
  cancelReservation,
  completeReservation,
  blockDate,
  unblockDate,
  joinWaitlist,
  leaveWaitlist,
  getAmenities,
  getAmenity,
  getReservationsForAmenity,
  getMyReservations,
  getAvailability,
  getBlockedDates,
  getWaitlistForSlot,
  getMyWaitlistEntries,
} from "@/services/amenities";
import { Principal } from "@dfinity/principal";

const NOW = BigInt(1_700_000_000_000_000_000);
const CALLER = Principal.fromText("2vxsx-fae");

const MOCK_AMENITY: any = {
  id:                 "AMN_1",
  name:               "Pool",
  description:        "Outdoor pool",
  capacity:           BigInt(20),
  slotDurationMins:   BigInt(60),
  advanceBookingDays: BigInt(30),
  depositAmountCents: [],
  cancellationHours:  BigInt(24),
  isActive:           true,
  createdAt:          NOW,
};

const MOCK_RESERVATION: any = {
  id:         "RSV_1",
  amenityId:  "AMN_1",
  date:       "2025-07-04",
  startSlot:  BigInt(2),
  guestCount: BigInt(3),
  bookedBy:   CALLER,
  unitId:     "7C",
  status:     { Active: null },
  createdAt:  NOW,
};

const MOCK_WAITLIST: any = {
  id:        "WLT_1",
  amenityId: "AMN_1",
  date:      "2025-07-04",
  startSlot: BigInt(2),
  principal: CALLER,
  unitId:    "7C",
  position:  BigInt(1),
  createdAt: NOW,
};

const MOCK_BLOCKED: any = {
  id:        "BLK_1",
  amenityId: "AMN_1",
  date:      "2025-07-05",
  reason:    "Maintenance",
  blockedBy: CALLER,
  createdAt: NOW,
};

const MOCK_SLOT: any = {
  slot:      BigInt(2),
  booked:    BigInt(3),
  capacity:  BigInt(20),
  available: true,
  blocked:   false,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    createAmenity:            vi.fn().mockResolvedValue({ ok: MOCK_AMENITY }),
    updateAmenity:            vi.fn().mockResolvedValue({ ok: { ...MOCK_AMENITY, isActive: false } }),
    createReservation:        vi.fn().mockResolvedValue({ ok: MOCK_RESERVATION }),
    cancelReservation:        vi.fn().mockResolvedValue({ ok: { ...MOCK_RESERVATION, status: { Cancelled: null } } }),
    completeReservation:      vi.fn().mockResolvedValue({ ok: { ...MOCK_RESERVATION, status: { Completed: null } } }),
    blockDate:                vi.fn().mockResolvedValue({ ok: MOCK_BLOCKED }),
    unblockDate:              vi.fn().mockResolvedValue({ ok: null }),
    joinWaitlist:             vi.fn().mockResolvedValue({ ok: MOCK_WAITLIST }),
    leaveWaitlist:            vi.fn().mockResolvedValue({ ok: null }),
    getAmenities:             vi.fn().mockResolvedValue([MOCK_AMENITY]),
    getAmenity:               vi.fn().mockResolvedValue([MOCK_AMENITY]),
    getReservationsForAmenity: vi.fn().mockResolvedValue([MOCK_RESERVATION]),
    getMyReservations:        vi.fn().mockResolvedValue([MOCK_RESERVATION]),
    getAvailability:          vi.fn().mockResolvedValue([MOCK_SLOT]),
    getBlockedDates:          vi.fn().mockResolvedValue([MOCK_BLOCKED]),
    getWaitlistForSlot:       vi.fn().mockResolvedValue([MOCK_WAITLIST]),
    getMyWaitlistEntries:     vi.fn().mockResolvedValue([MOCK_WAITLIST]),
    ...overrides,
  };
}

// ─── createAmenity ────────────────────────────────────────────────────────────

describe("amenities service — createAmenity", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created amenity", async () => {
    const result = await createAmenity("Pool", "Outdoor pool", 20, 60, 30, [], 24);
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.name).toBe("Pool");
    expect(result.ok.id).toBe("AMN_1");
  });

  it("passes depositAmountCents as empty Opt when not provided", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await createAmenity("Pool", "", 20, 60, 30, [], 24);
    expect(actor.createAmenity).toHaveBeenCalledWith(
      "Pool", "", BigInt(20), BigInt(60), BigInt(30), [], BigInt(24)
    );
  });

  it("passes depositAmountCents as [bigint] Opt when provided", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await createAmenity("Pool", "", 20, 60, 30, [5000], 24);
    expect(actor.createAmenity).toHaveBeenCalledWith(
      "Pool", "", BigInt(20), BigInt(60), BigInt(30), [BigInt(5000)], BigInt(24)
    );
  });

  it("returns err when canister not deployed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(null as any);
    const result = await createAmenity("Pool", "", 20, 60, 30, [], 24);
    expect(result).toHaveProperty("err");
  });
});

// ─── updateAmenity ────────────────────────────────────────────────────────────

describe("amenities service — updateAmenity", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated amenity", async () => {
    const result = await updateAmenity("AMN_1", "Pool", "Outdoor pool", 20, 60, 30, [], 24, false);
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.isActive).toBe(false);
  });
});

// ─── createReservation ────────────────────────────────────────────────────────

describe("amenities service — createReservation", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the reservation", async () => {
    const result = await createReservation("AMN_1", "2025-07-04", 2, 3, "7C");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.amenityId).toBe("AMN_1");
    expect(result.ok.startSlot).toBe(BigInt(2));
    expect(result.ok.guestCount).toBe(BigInt(3));
  });

  it("passes args as bigints to the actor", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await createReservation("AMN_1", "2025-07-04", 2, 3, "7C");
    expect(actor.createReservation).toHaveBeenCalledWith(
      "AMN_1", "2025-07-04", BigInt(2), BigInt(3), "7C"
    );
  });

  it("returns err on capacity exceeded", async () => {
    const actor = makeMockActor({ createReservation: vi.fn().mockResolvedValue({ err: { CapacityExceeded: null } }) });
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    const result = await createReservation("AMN_1", "2025-07-04", 2, 25, "7C");
    expect(result).toHaveProperty("err");
    if (!("err" in result)) return;
    expect(result.err).toHaveProperty("CapacityExceeded");
  });
});

// ─── cancelReservation ────────────────────────────────────────────────────────

describe("amenities service — cancelReservation", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with cancelled status", async () => {
    const result = await cancelReservation("RSV_1");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.status).toHaveProperty("Cancelled");
  });
});

// ─── completeReservation ──────────────────────────────────────────────────────

describe("amenities service — completeReservation", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with completed status", async () => {
    const result = await completeReservation("RSV_1");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.status).toHaveProperty("Completed");
  });
});

// ─── blockDate / unblockDate ──────────────────────────────────────────────────

describe("amenities service — blockDate", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the blocked date record", async () => {
    const result = await blockDate("AMN_1", "2025-07-05", "Maintenance");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.date).toBe("2025-07-05");
    expect(result.ok.reason).toBe("Maintenance");
  });
});

describe("amenities service — unblockDate", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok null", async () => {
    const result = await unblockDate("BLK_1");
    expect(result).toHaveProperty("ok");
  });
});

// ─── waitlist ─────────────────────────────────────────────────────────────────

describe("amenities service — joinWaitlist", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with waitlist entry", async () => {
    const result = await joinWaitlist("AMN_1", "2025-07-04", 2, "7C");
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) return;
    expect(result.ok.position).toBe(BigInt(1));
  });

  it("passes startSlot as bigint", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await joinWaitlist("AMN_1", "2025-07-04", 2, "7C");
    expect(actor.joinWaitlist).toHaveBeenCalledWith("AMN_1", "2025-07-04", BigInt(2), "7C");
  });
});

describe("amenities service — leaveWaitlist", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok null", async () => {
    const result = await leaveWaitlist("WLT_1");
    expect(result).toHaveProperty("ok");
  });
});

// ─── queries ──────────────────────────────────────────────────────────────────

describe("amenities service — getAmenities", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns array of amenities", async () => {
    const result = await getAmenities();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("Pool");
  });

  it("returns empty array when canister not deployed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(null as any);
    expect(await getAmenities()).toEqual([]);
  });
});

describe("amenities service — getAmenity", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the amenity when found", async () => {
    const result = await getAmenity("AMN_1");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Pool");
  });

  it("returns null when not found", async () => {
    const actor = makeMockActor({ getAmenity: vi.fn().mockResolvedValue([]) });
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    expect(await getAmenity("MISSING")).toBeNull();
  });
});

describe("amenities service — getReservationsForAmenity", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns reservations for a given amenity/date", async () => {
    const result = await getReservationsForAmenity("AMN_1", "2025-07-04");
    expect(result.length).toBe(1);
    expect(result[0].amenityId).toBe("AMN_1");
  });
});

describe("amenities service — getMyReservations", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns reservations for the caller", async () => {
    const result = await getMyReservations("2vxsx-fae");
    expect(result.length).toBe(1);
  });
});

describe("amenities service — getAvailability", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns slot availability array", async () => {
    const result = await getAvailability("AMN_1", "2025-07-04");
    expect(result.length).toBe(1);
    expect(result[0].available).toBe(true);
  });
});

describe("amenities service — getBlockedDates", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns blocked dates for amenity", async () => {
    const result = await getBlockedDates("AMN_1");
    expect(result.length).toBe(1);
    expect(result[0].date).toBe("2025-07-05");
  });
});

describe("amenities service — getWaitlistForSlot", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns waitlist entries for the slot", async () => {
    const result = await getWaitlistForSlot("AMN_1", "2025-07-04", 2);
    expect(result.length).toBe(1);
    expect(result[0].position).toBe(BigInt(1));
  });

  it("passes startSlot as bigint", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await getWaitlistForSlot("AMN_1", "2025-07-04", 2);
    expect(actor.getWaitlistForSlot).toHaveBeenCalledWith("AMN_1", "2025-07-04", BigInt(2));
  });
});

describe("amenities service — getMyWaitlistEntries", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns waitlist entries for the principal", async () => {
    const result = await getMyWaitlistEntries("2vxsx-fae");
    expect(result.length).toBe(1);
  });
});

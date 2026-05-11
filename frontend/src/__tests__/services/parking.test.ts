import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_PARKING = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  registerVehicle,
  issuePermit,
  logViolation,
  authorizeTow,
  lookupVehicle,
  getVehiclesForUnit,
  getPermitsForVehicle,
  getAllParkingViolations,
} from "@/services/parking";

const NOW = BigInt(1_700_000_000_000_000_000);

const MOCK_VEHICLE: any = {
  id:           "VEH_1",
  unitId:       "unit-7C",
  make:         "Toyota",
  model:        "Camry",
  year:         2022,
  color:        "Silver",
  licensePlate: "ABC1234",
  plateState:   "TX",
  registeredBy: { toText: () => "owner-principal" } as any,
  createdAt:    NOW,
};

const MOCK_PERMIT: any = {
  id:           "PRM_1",
  vehicleId:    "VEH_1",
  permitNumber: "PRK-00001",
  permitType:   { Resident: null },
  expiresAt:    [],
  issuedBy:     { toText: () => "board-principal" } as any,
  createdAt:    NOW,
};

const MOCK_PARKING_VIOLATION: any = {
  id:           "PKV_1",
  licensePlate: "XYZ9999",
  plateState:   "TX",
  location:     "Lot B, Space 14",
  description:  "Parked in fire lane",
  photoHash:    [],
  noticeType:   { Warning: null },
  towAuthorized: false,
  loggedBy:     { toText: () => "manager-principal" } as any,
  createdAt:    NOW,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    registerVehicle:       vi.fn().mockResolvedValue({ ok: MOCK_VEHICLE }),
    issuePermit:           vi.fn().mockResolvedValue({ ok: MOCK_PERMIT }),
    logViolation:          vi.fn().mockResolvedValue({ ok: MOCK_PARKING_VIOLATION }),
    authorizeTow:          vi.fn().mockResolvedValue({ ok: { ...MOCK_PARKING_VIOLATION, towAuthorized: true } }),
    lookupVehicle:         vi.fn().mockResolvedValue([MOCK_VEHICLE]),
    getVehiclesForUnit:    vi.fn().mockResolvedValue([MOCK_VEHICLE]),
    getPermitsForVehicle:  vi.fn().mockResolvedValue([MOCK_PERMIT]),
    getAllParkingViolations: vi.fn().mockResolvedValue([MOCK_PARKING_VIOLATION]),
    ...overrides,
  };
}

describe("parking service — registerVehicle", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the registered vehicle", async () => {
    const result = await registerVehicle("unit-7C", "Toyota", "Camry", 2022, "Silver", "ABC1234", "TX");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("VEH_1");
    expect((result as any).ok.licensePlate).toBe("ABC1234");
  });

  it("returns err on empty license plate", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ registerVehicle: vi.fn().mockResolvedValue({ err: { InvalidInput: "licensePlate required" } }) }) as any
    );
    const result = await registerVehicle("unit-7C", "Toyota", "Camry", 2022, "Silver", "", "TX");
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("parking service — issuePermit", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the issued permit", async () => {
    const result = await issuePermit("VEH_1", { Resident: null }, []);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.permitNumber).toBe("PRK-00001");
    expect((result as any).ok.permitType).toEqual({ Resident: null });
  });

  it("returns err when vehicle not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ issuePermit: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await issuePermit("no-such-id", { Guest: null }, []);
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("parking service — logViolation", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the logged violation", async () => {
    const result = await logViolation("XYZ9999", "TX", "Lot B, Space 14", "Parked in fire lane", [], { Warning: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("PKV_1");
    expect((result as any).ok.towAuthorized).toBe(false);
  });

  it("returns err when caller is anonymous", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ logViolation: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await logViolation("XYZ9999", "TX", "Lot B", "desc", [], { Warning: null });
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("parking service — authorizeTow", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with towAuthorized set to true", async () => {
    const result = await authorizeTow("PKV_1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.towAuthorized).toBe(true);
  });

  it("returns err when violation not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ authorizeTow: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await authorizeTow("no-such-id");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("parking service — lookupVehicle", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the vehicle when plate is found", async () => {
    const result = await lookupVehicle("TX", "ABC1234");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("VEH_1");
  });

  it("returns null when plate is not registered", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ lookupVehicle: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await lookupVehicle("TX", "UNKNOWN")).toBeNull();
  });
});

describe("parking service — getVehiclesForUnit", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns vehicles for the specified unit", async () => {
    const results = await getVehiclesForUnit("unit-7C");
    expect(results).toHaveLength(1);
    expect(results[0].unitId).toBe("unit-7C");
  });

  it("returns empty array for a unit with no vehicles", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getVehiclesForUnit: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getVehiclesForUnit("unit-99Z")).toEqual([]);
  });
});

describe("parking service — getPermitsForVehicle", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns permits for the specified vehicle", async () => {
    const results = await getPermitsForVehicle("VEH_1");
    expect(results).toHaveLength(1);
    expect(results[0].vehicleId).toBe("VEH_1");
  });

  it("returns empty array for a vehicle with no permits", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getPermitsForVehicle: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getPermitsForVehicle("VEH_99")).toEqual([]);
  });
});

describe("parking service — getAllParkingViolations", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all parking violations", async () => {
    const results = await getAllParkingViolations();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("PKV_1");
  });

  it("returns empty array when none exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllParkingViolations: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllParkingViolations()).toEqual([]);
  });
});

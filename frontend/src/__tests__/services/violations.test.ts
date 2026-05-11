import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_VIOLATIONS = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  createViolation,
  addReply,
  updateStatus,
  getViolation,
  getMyViolations,
  getViolationsForUnit,
  getAllViolations,
} from "@/services/violations";

const MOCK_REPLY: any = {
  author:    { toText: () => "board-principal" } as any,
  text:      "We will investigate.",
  createdAt: BigInt(1_700_000_100_000_000_000),
};

const MOCK_VIOLATION: any = {
  id:          "v-001",
  unitId:      "unit-4B",
  category:    { Parking: null },
  description: "Vehicle blocking fire lane",
  photoHash:   ["abc123"],
  status:      { Open: null },
  replies:     [],
  submittedBy: { toText: () => "resident-principal" } as any,
  createdAt:   BigInt(1_700_000_000_000_000_000),
  updatedAt:   BigInt(1_700_000_000_000_000_000),
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    createViolation:     vi.fn().mockResolvedValue({ ok: MOCK_VIOLATION }),
    addReply:            vi.fn().mockResolvedValue({ ok: { ...MOCK_VIOLATION, replies: [MOCK_REPLY] } }),
    updateStatus:        vi.fn().mockResolvedValue({ ok: { ...MOCK_VIOLATION, status: { Resolved: null } } }),
    getViolation:        vi.fn().mockResolvedValue([MOCK_VIOLATION]),
    getMyViolations:     vi.fn().mockResolvedValue([MOCK_VIOLATION]),
    getViolationsForUnit:vi.fn().mockResolvedValue([MOCK_VIOLATION]),
    getAllViolations:     vi.fn().mockResolvedValue([MOCK_VIOLATION]),
    ...overrides,
  };
}

describe("violations service — createViolation", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created violation", async () => {
    const result = await createViolation("unit-4B", { Parking: null }, "Vehicle blocking fire lane", ["abc123"]);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("v-001");
    expect((result as any).ok.category).toEqual({ Parking: null });
  });

  it("returns err on invalid input", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ createViolation: vi.fn().mockResolvedValue({ err: { InvalidInput: "description too short" } }) }) as any
    );
    const result = await createViolation("unit-4B", { Parking: null }, "", []);
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("violations service — addReply", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the updated violation containing the reply", async () => {
    const result = await addReply("v-001", "We will investigate.");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.replies).toHaveLength(1);
    expect((result as any).ok.replies[0].text).toBe("We will investigate.");
  });

  it("returns err when violation not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ addReply: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await addReply("bad-id", "text");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("violations service — updateStatus", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the updated violation status", async () => {
    const result = await updateStatus("v-001", { Resolved: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Resolved: null });
  });

  it("returns err when violation not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ updateStatus: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await updateStatus("bad-id", { Resolved: null });
    expect((result as any).err).toHaveProperty("NotFound");
  });

  it("returns err when caller is not authorized to change status", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ updateStatus: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await updateStatus("v-001", { Resolved: null });
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("violations service — getViolation", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the violation when found", async () => {
    const result = await getViolation("v-001");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("v-001");
    expect(result!.unitId).toBe("unit-4B");
  });

  it("returns null when not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getViolation: vi.fn().mockResolvedValue([]) }) as any
    );
    const result = await getViolation("no-such-id");
    expect(result).toBeNull();
  });
});

describe("violations service — getMyViolations", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns violations submitted by the caller", async () => {
    const results = await getMyViolations();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("v-001");
  });

  it("returns empty array when caller has no violations", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getMyViolations: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getMyViolations()).toEqual([]);
  });
});

describe("violations service — getViolationsForUnit", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns violations for the specified unit", async () => {
    const results = await getViolationsForUnit("unit-4B");
    expect(results).toHaveLength(1);
    expect(results[0].unitId).toBe("unit-4B");
  });

  it("returns empty array for a unit with no violations", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getViolationsForUnit: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getViolationsForUnit("unit-9Z")).toEqual([]);
  });
});

describe("violations service — getAllViolations", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all violations", async () => {
    const results = await getAllViolations();
    expect(results).toHaveLength(1);
  });

  it("returns empty array when no violations exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllViolations: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllViolations()).toEqual([]);
  });
});

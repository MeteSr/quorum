import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_ARC = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  submitRequest,
  updateStatus,
  getRequest,
  getRequestsForUnit,
  getMyRequests,
  getAllRequests,
} from "@/services/arc";

const NOW = BigInt(1_700_000_000_000_000_000);

const MOCK_REQUEST: any = {
  id:          "ARC_1",
  unitId:      "unit-12A",
  requestType: { Fence: null },
  description: "Installing a 6-foot cedar privacy fence along the rear property line.",
  photoHash:   ["sha256-abc123"],
  status:      { Pending: null },
  reviewNotes: [],
  submittedBy: { toText: () => "owner-principal" } as any,
  reviewedBy:  [],
  createdAt:   NOW,
  updatedAt:   NOW,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    submitRequest:      vi.fn().mockResolvedValue({ ok: MOCK_REQUEST }),
    updateStatus:       vi.fn().mockResolvedValue({ ok: { ...MOCK_REQUEST, status: { Approved: null } } }),
    getRequest:         vi.fn().mockResolvedValue([MOCK_REQUEST]),
    getRequestsForUnit: vi.fn().mockResolvedValue([MOCK_REQUEST]),
    getMyRequests:      vi.fn().mockResolvedValue([MOCK_REQUEST]),
    getAllRequests:      vi.fn().mockResolvedValue([MOCK_REQUEST]),
    ...overrides,
  };
}

describe("arc service — submitRequest", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created request", async () => {
    const result = await submitRequest("unit-12A", { Fence: null }, "cedar fence", []);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("ARC_1");
    expect((result as any).ok.requestType).toEqual({ Fence: null });
    expect((result as any).ok.status).toEqual({ Pending: null });
  });

  it("returns err on empty description", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ submitRequest: vi.fn().mockResolvedValue({ err: { InvalidInput: "description required" } }) }) as any
    );
    const result = await submitRequest("unit-12A", { Fence: null }, "", []);
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("arc service — updateStatus", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the updated status", async () => {
    const result = await updateStatus("ARC_1", { Approved: null }, ["Looks good"]);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Approved: null });
  });

  it("returns err when request not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ updateStatus: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await updateStatus("no-such-id", { Approved: null }, []);
    expect((result as any).err).toHaveProperty("NotFound");
  });

  it("returns err when caller is anonymous", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ updateStatus: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await updateStatus("ARC_1", { Rejected: null }, []);
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("arc service — getRequest", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the request when found", async () => {
    const result = await getRequest("ARC_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("ARC_1");
    expect(result!.unitId).toBe("unit-12A");
  });

  it("returns null when not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getRequest: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getRequest("no-such-id")).toBeNull();
  });
});

describe("arc service — getRequestsForUnit", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns requests for the specified unit", async () => {
    const results = await getRequestsForUnit("unit-12A");
    expect(results).toHaveLength(1);
    expect(results[0].unitId).toBe("unit-12A");
  });

  it("returns empty array for a unit with no requests", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getRequestsForUnit: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getRequestsForUnit("unit-99Z")).toEqual([]);
  });
});

describe("arc service — getMyRequests", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns requests submitted by the caller", async () => {
    const results = await getMyRequests();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("ARC_1");
  });

  it("returns empty array when caller has no requests", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getMyRequests: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getMyRequests()).toEqual([]);
  });
});

describe("arc service — getAllRequests", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all requests", async () => {
    const results = await getAllRequests();
    expect(results).toHaveLength(1);
  });

  it("returns empty array when no requests exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllRequests: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllRequests()).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_MAINTENANCE = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  getMyRequests,
  getAllRequests,
  getOpenRequests,
  submitRequest,
  assignRequest,
  updateStatus,
} from "@/services/maintenance";

const MOCK_REQUEST = {
  id: "MAINT_1",
  unitId: "42B",
  category: { Plumbing: null },
  description: "Leak under kitchen sink",
  photoHashes: ["sha256-abc"],
  submittedBy: { toText: () => "member-principal" } as any,
  assignedVendorId: [] as [],
  scheduledDate: [] as [],
  status: { Open: null },
  slaWarning: false,
  history: [],
  createdAt: BigInt(1_700_000_000_000_000_000),
  updatedAt: BigInt(1_700_000_000_000_000_000),
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getMyRequests:  vi.fn().mockResolvedValue([MOCK_REQUEST]),
    getAllRequests:  vi.fn().mockResolvedValue([MOCK_REQUEST]),
    getOpenRequests: vi.fn().mockResolvedValue([MOCK_REQUEST]),
    submitRequest:  vi.fn().mockResolvedValue({ ok: MOCK_REQUEST }),
    assignRequest:  vi.fn().mockResolvedValue({ ok: MOCK_REQUEST }),
    updateStatus:   vi.fn().mockResolvedValue({ ok: MOCK_REQUEST }),
    ...overrides,
  };
}

describe("maintenance service", () => {
  let mockActor: ReturnType<typeof makeMockActor>;

  beforeEach(() => {
    mockActor = makeMockActor();
    (Actor.createActor as any).mockReturnValue(mockActor);
  });

  // ── getMyRequests ────────────────────────────────────────────────────────

  it("getMyRequests returns the caller's requests", async () => {
    const result = await getMyRequests();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("MAINT_1");
    expect(mockActor.getMyRequests).toHaveBeenCalledOnce();
  });

  it("getMyRequests returns [] when actor returns empty", async () => {
    (Actor.createActor as any).mockReturnValue(makeMockActor({ getMyRequests: vi.fn().mockResolvedValue([]) }));
    expect(await getMyRequests()).toEqual([]);
  });

  // ── getAllRequests ────────────────────────────────────────────────────────

  it("getAllRequests returns all requests", async () => {
    const result = await getAllRequests();
    expect(result).toHaveLength(1);
    expect(mockActor.getAllRequests).toHaveBeenCalledOnce();
  });

  // ── getOpenRequests ───────────────────────────────────────────────────────

  it("getOpenRequests returns open requests", async () => {
    const result = await getOpenRequests();
    expect(result).toHaveLength(1);
    expect(result[0].status).toEqual({ Open: null });
    expect(mockActor.getOpenRequests).toHaveBeenCalledOnce();
  });

  // ── submitRequest ─────────────────────────────────────────────────────────

  it("submitRequest returns the new request on ok", async () => {
    const result = await submitRequest("42B", { Plumbing: null }, "Leak under sink", []);
    expect("ok" in result).toBe(true);
    if ("ok" in result) {
      expect(result.ok.id).toBe("MAINT_1");
      expect(result.ok.unitId).toBe("42B");
    }
    expect(mockActor.submitRequest).toHaveBeenCalledWith(
      "42B", { Plumbing: null }, "Leak under sink", []
    );
  });

  it("submitRequest returns err NotAuthorized when not a member", async () => {
    (Actor.createActor as any).mockReturnValue(
      makeMockActor({ submitRequest: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) })
    );
    const result = await submitRequest("42B", { Plumbing: null }, "Leak", []);
    expect("err" in result).toBe(true);
    if ("err" in result) expect("NotAuthorized" in result.err).toBe(true);
  });

  // ── assignRequest ─────────────────────────────────────────────────────────

  it("assignRequest returns updated request on ok", async () => {
    const result = await assignRequest("MAINT_1", "vendor-123", null);
    expect("ok" in result).toBe(true);
    expect(mockActor.assignRequest).toHaveBeenCalledWith("MAINT_1", "vendor-123", []);
  });

  it("assignRequest returns err NotFound for unknown id", async () => {
    (Actor.createActor as any).mockReturnValue(
      makeMockActor({ assignRequest: vi.fn().mockResolvedValue({ err: { NotFound: null } }) })
    );
    const result = await assignRequest("MAINT_999", "vendor-123", null);
    expect("err" in result).toBe(true);
    if ("err" in result) expect("NotFound" in result.err).toBe(true);
  });

  // ── updateStatus ──────────────────────────────────────────────────────────

  it("updateStatus returns updated request on ok", async () => {
    const result = await updateStatus("MAINT_1", { InProgress: null }, "Plumber en route");
    expect("ok" in result).toBe(true);
    expect(mockActor.updateStatus).toHaveBeenCalledWith(
      "MAINT_1", { InProgress: null }, "Plumber en route"
    );
  });

  it("updateStatus returns err NotFound for unknown id", async () => {
    (Actor.createActor as any).mockReturnValue(
      makeMockActor({ updateStatus: vi.fn().mockResolvedValue({ err: { NotFound: null } }) })
    );
    const result = await updateStatus("MAINT_999", { Resolved: null }, "Fixed");
    expect("err" in result).toBe(true);
    if ("err" in result) expect("NotFound" in result.err).toBe(true);
  });
});

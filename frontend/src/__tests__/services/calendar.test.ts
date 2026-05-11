import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_CALENDAR = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  getUpcomingEvents,
} from "@/services/calendar";

const NOW  = BigInt(1_700_000_000_000_000_000);
const SOON = BigInt(1_700_003_600_000_000_000);

const MOCK_EVENT = {
  id: "CAL_1",
  title: "Annual Meeting",
  startAt: NOW,
  endAt: SOON,
  eventType: { Meeting: null },
  visibility: { All: null },
  location: ["Clubhouse"] as [string],
  createdBy: { toText: () => "principal-abc" } as any,
  createdAt: NOW,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    createEvent:       vi.fn().mockResolvedValue({ ok: MOCK_EVENT }),
    deleteEvent:       vi.fn().mockResolvedValue({ ok: null }),
    getEvent:          vi.fn().mockResolvedValue([MOCK_EVENT]),
    listEvents:        vi.fn().mockResolvedValue([MOCK_EVENT]),
    getUpcomingEvents: vi.fn().mockResolvedValue([MOCK_EVENT]),
    setMeetingsCanisterId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("calendar service", () => {
  let mockActor: ReturnType<typeof makeMockActor>;

  beforeEach(() => {
    mockActor = makeMockActor();
    (Actor.createActor as any).mockReturnValue(mockActor);
  });

  // ── createEvent ──────────────────────────────────────────────────────────

  it("createEvent returns the created event", async () => {
    const result = await createEvent(
      "Annual Meeting", NOW, SOON,
      { Meeting: null }, { All: null }, "Clubhouse"
    );
    expect(result).toEqual(MOCK_EVENT);
    expect(mockActor.createEvent).toHaveBeenCalledWith(
      "Annual Meeting", NOW, SOON,
      { Meeting: null }, { All: null }, ["Clubhouse"]
    );
  });

  it("createEvent passes empty opt when location omitted", async () => {
    await createEvent("Inspection", NOW, SOON, { MaintenanceWindow: null }, { Board: null });
    expect(mockActor.createEvent).toHaveBeenCalledWith(
      "Inspection", NOW, SOON,
      { MaintenanceWindow: null }, { Board: null }, []
    );
  });

  it("createEvent throws on err response", async () => {
    mockActor.createEvent.mockResolvedValueOnce({ err: { InvalidInput: "title required" } });
    await expect(
      createEvent("", NOW, SOON, { Meeting: null }, { All: null })
    ).rejects.toThrow();
  });

  // ── deleteEvent ──────────────────────────────────────────────────────────

  it("deleteEvent resolves on success", async () => {
    await expect(deleteEvent("CAL_1")).resolves.not.toThrow();
    expect(mockActor.deleteEvent).toHaveBeenCalledWith("CAL_1");
  });

  it("deleteEvent throws on NotFound", async () => {
    mockActor.deleteEvent.mockResolvedValueOnce({ err: { NotFound: null } });
    await expect(deleteEvent("CAL_9999")).rejects.toThrow();
  });

  // ── getEvent ─────────────────────────────────────────────────────────────

  it("getEvent returns event when found", async () => {
    const result = await getEvent("CAL_1");
    expect(result).toEqual(MOCK_EVENT);
  });

  it("getEvent returns null for unknown id", async () => {
    mockActor.getEvent.mockResolvedValueOnce([]);
    const result = await getEvent("CAL_9999");
    expect(result).toBeNull();
  });

  // ── listEvents ───────────────────────────────────────────────────────────

  it("listEvents returns events in range", async () => {
    const result = await listEvents(NOW, SOON);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("CAL_1");
    expect(mockActor.listEvents).toHaveBeenCalledWith(NOW, SOON);
  });

  it("listEvents returns empty array when no events in range", async () => {
    mockActor.listEvents.mockResolvedValueOnce([]);
    const result = await listEvents(NOW, SOON);
    expect(result).toEqual([]);
  });

  // ── getUpcomingEvents ────────────────────────────────────────────────────

  it("getUpcomingEvents returns upcoming events", async () => {
    const result = await getUpcomingEvents(10);
    expect(result).toHaveLength(1);
    expect(mockActor.getUpcomingEvents).toHaveBeenCalledWith(10n);
  });

  it("getUpcomingEvents returns empty array when none", async () => {
    mockActor.getUpcomingEvents.mockResolvedValueOnce([]);
    const result = await getUpcomingEvents(5);
    expect(result).toEqual([]);
  });
});

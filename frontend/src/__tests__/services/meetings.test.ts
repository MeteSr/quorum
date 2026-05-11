import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_MEETINGS = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  createMeeting,
  addAgendaItem,
  recordAttendance,
  addMotion,
  generateMinutes,
  getMeeting,
  getAllMeetings,
} from "@/services/meetings";

const NOW = BigInt(1_700_000_000_000_000_000);

const MOCK_AGENDA_ITEM = {
  id: "AGI_1",
  title: "Approve budget",
  presenter: ["Alice"] as [string],
  durationMins: [30n] as [bigint],
  motions: [],
};

const MOCK_MEETING = {
  id: "MTG_1",
  date: NOW,
  meetingType: { Board: null },
  agendaItems: [MOCK_AGENDA_ITEM],
  attendees: [],
  quorumMet: false,
  minutesText: [] as [],
  createdBy: { toText: () => "principal-abc" } as any,
  createdAt: NOW,
  updatedAt: NOW,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    createMeeting:     vi.fn().mockResolvedValue({ ok: MOCK_MEETING }),
    addAgendaItem:     vi.fn().mockResolvedValue({ ok: MOCK_MEETING }),
    recordAttendance:  vi.fn().mockResolvedValue({ ok: MOCK_MEETING }),
    addMotion:         vi.fn().mockResolvedValue({ ok: MOCK_MEETING }),
    generateMinutes:   vi.fn().mockResolvedValue({ ok: "MINUTES TEXT" }),
    getMeeting:        vi.fn().mockResolvedValue([MOCK_MEETING]),
    getAllMeetings:     vi.fn().mockResolvedValue([MOCK_MEETING]),
    setCalendarCanisterId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("meetings service", () => {
  let mockActor: ReturnType<typeof makeMockActor>;

  beforeEach(() => {
    mockActor = makeMockActor();
    (Actor.createActor as any).mockReturnValue(mockActor);
  });

  // ── createMeeting ────────────────────────────────────────────────────────

  it("createMeeting returns the created meeting on success", async () => {
    const result = await createMeeting(NOW, { Board: null }, ["Approve budget"]);
    expect(result).toEqual(MOCK_MEETING);
    expect(mockActor.createMeeting).toHaveBeenCalledWith(NOW, { Board: null }, ["Approve budget"]);
  });

  it("createMeeting throws on err response", async () => {
    mockActor.createMeeting.mockResolvedValueOnce({ err: { InvalidInput: "date required" } });
    await expect(createMeeting(NOW, { Board: null }, [])).rejects.toThrow();
  });

  // ── addAgendaItem ────────────────────────────────────────────────────────

  it("addAgendaItem returns updated meeting", async () => {
    const result = await addAgendaItem("MTG_1", "Approve budget", "Alice", 30);
    expect(result).toEqual(MOCK_MEETING);
    expect(mockActor.addAgendaItem).toHaveBeenCalledWith("MTG_1", "Approve budget", ["Alice"], [30n]);
  });

  it("addAgendaItem passes empty opt when presenter omitted", async () => {
    await addAgendaItem("MTG_1", "Open floor", undefined, undefined);
    expect(mockActor.addAgendaItem).toHaveBeenCalledWith("MTG_1", "Open floor", [], []);
  });

  // ── recordAttendance ─────────────────────────────────────────────────────

  it("recordAttendance updates meeting attendance", async () => {
    const principals = [{ toText: () => "p1" } as any];
    const result = await recordAttendance("MTG_1", principals);
    expect(result).toEqual(MOCK_MEETING);
    expect(mockActor.recordAttendance).toHaveBeenCalledWith("MTG_1", principals);
  });

  // ── addMotion ────────────────────────────────────────────────────────────

  it("addMotion adds motion to agenda item", async () => {
    const result = await addMotion(
      "MTG_1", "AGI_1",
      "Approve $45k budget",
      "Alice", "Bob",
      { Passed: null },
      { forVotes: 5n, againstVotes: 1n, abstainVotes: 0n }
    );
    expect(result).toEqual(MOCK_MEETING);
    expect(mockActor.addMotion).toHaveBeenCalledWith(
      "MTG_1", "AGI_1",
      "Approve $45k budget",
      "Alice", "Bob",
      { Passed: null },
      { forVotes: 5n, againstVotes: 1n, abstainVotes: 0n }
    );
  });

  // ── generateMinutes ──────────────────────────────────────────────────────

  it("generateMinutes returns formatted text", async () => {
    const result = await generateMinutes("MTG_1");
    expect(result).toBe("MINUTES TEXT");
    expect(mockActor.generateMinutes).toHaveBeenCalledWith("MTG_1");
  });

  it("generateMinutes throws on NotFound", async () => {
    mockActor.generateMinutes.mockResolvedValueOnce({ err: { NotFound: null } });
    await expect(generateMinutes("MTG_9999")).rejects.toThrow();
  });

  // ── getMeeting ───────────────────────────────────────────────────────────

  it("getMeeting returns meeting when found", async () => {
    const result = await getMeeting("MTG_1");
    expect(result).toEqual(MOCK_MEETING);
  });

  it("getMeeting returns null for unknown id", async () => {
    mockActor.getMeeting.mockResolvedValueOnce([]);
    const result = await getMeeting("MTG_9999");
    expect(result).toBeNull();
  });

  // ── getAllMeetings ────────────────────────────────────────────────────────

  it("getAllMeetings returns list", async () => {
    const result = await getAllMeetings();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("MTG_1");
  });

  it("getAllMeetings returns empty array when no meetings", async () => {
    mockActor.getAllMeetings.mockResolvedValueOnce([]);
    const result = await getAllMeetings();
    expect(result).toEqual([]);
  });
});

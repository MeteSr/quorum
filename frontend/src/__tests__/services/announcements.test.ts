import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_ANNOUNCEMENTS = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  getActive,
  getUrgent,
  getAll,
  post,
  deleteAnnouncement,
  broadcastEmergency,
  getBroadcasts,
  getRecentBroadcasts,
  setEmailConfig,
  setMembersCanisterId,
  sendBulkEmail,
} from "@/services/announcements";

const MOCK_NOTICE: any = {
  id:        "notice-1",
  title:     "Pool closure for maintenance",
  body:      "The pool will be closed Saturday 9am–2pm.",
  priority:  { Normal: null },
  postedBy:  { toText: () => "board-principal" } as any,
  postedAt:  BigInt(1_700_000_000_000_000_000),
  expiresAt: [] as [],
};

const MOCK_URGENT: any = {
  ...MOCK_NOTICE,
  id:       "notice-2",
  title:    "Water shut-off tonight",
  priority: { Urgent: null },
};

const MOCK_BROADCAST: any = {
  id:       "BCAST_1",
  title:    "Water main break on Oak St",
  body:     "Avoid the area. Water service restored by 6pm.",
  severity: { Emergency: null },
  sentBy:   { toText: () => "board-principal" } as any,
  sentAt:   BigInt(1_700_000_000_000_000_000),
};

const MOCK_BULK_RESULT = { sentCount: BigInt(5), failedCount: BigInt(0) };

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getActive:            vi.fn().mockResolvedValue([MOCK_NOTICE]),
    getUrgent:            vi.fn().mockResolvedValue([MOCK_URGENT]),
    getAll:               vi.fn().mockResolvedValue([MOCK_NOTICE, MOCK_URGENT]),
    post:                 vi.fn().mockResolvedValue({ ok: MOCK_NOTICE }),
    delete:               vi.fn().mockResolvedValue({ ok: null }),
    broadcastEmergency:   vi.fn().mockResolvedValue({ ok: MOCK_BROADCAST }),
    getBroadcasts:        vi.fn().mockResolvedValue([MOCK_BROADCAST]),
    getRecentBroadcasts:  vi.fn().mockResolvedValue([MOCK_BROADCAST]),
    setEmailConfig:       vi.fn().mockResolvedValue(undefined),
    setMembersCanisterId: vi.fn().mockResolvedValue(undefined),
    sendBulkEmail:        vi.fn().mockResolvedValue({ ok: MOCK_BULK_RESULT }),
    ...overrides,
  };
}

describe("announcements service — getActive / getUrgent / getAll", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getActive returns active announcements", async () => {
    const notices = await getActive();
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe("Pool closure for maintenance");
  });

  it("getUrgent returns only Urgent priority items", async () => {
    const notices = await getUrgent();
    expect(notices).toHaveLength(1);
    expect(notices[0].priority).toEqual({ Urgent: null });
  });

  it("getAll returns all announcements", async () => {
    const notices = await getAll();
    expect(notices).toHaveLength(2);
  });

  it("returns empty array when no announcements", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getActive: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getActive()).toEqual([]);
  });
});

describe("announcements service — post", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created announcement", async () => {
    const result = await post("Pool closure", "Closed Saturday", { Normal: null }, []);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.title).toBe("Pool closure for maintenance"); // mock value
  });

  it("returns err when caller is not authorized", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ post: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await post("Title", "Body", { Normal: null }, []);
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("announcements service — deleteAnnouncement", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok on successful deletion", async () => {
    const result = await deleteAnnouncement("notice-1");
    expect(result).toHaveProperty("ok");
  });

  it("returns err when announcement not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ delete: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await deleteAnnouncement("bad-id");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("announcements service — broadcastEmergency", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with created broadcast", async () => {
    const result = await broadcastEmergency("Water main break", "Avoid Oak St.", { Emergency: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.severity).toEqual({ Emergency: null });
  });

  it("passes severity variant correctly", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await broadcastEmergency("Gas leak warning", "Evacuate block 4.", { Warning: null });
    expect(actor.broadcastEmergency).toHaveBeenCalledWith("Gas leak warning", "Evacuate block 4.", { Warning: null });
  });

  it("returns err NotAuthorized for anonymous caller", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ broadcastEmergency: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await broadcastEmergency("Title", "Body", { Info: null });
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("announcements service — getBroadcasts", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns list of broadcasts", async () => {
    const results = await getBroadcasts();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("BCAST_1");
  });

  it("returns empty array when no broadcasts", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getBroadcasts: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getBroadcasts()).toEqual([]);
  });
});

describe("announcements service — getRecentBroadcasts", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns broadcasts within window", async () => {
    const results = await getRecentBroadcasts(30);
    expect(results).toHaveLength(1);
  });

  it("passes days as BigInt", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await getRecentBroadcasts(7);
    expect(actor.getRecentBroadcasts).toHaveBeenCalledWith(BigInt(7));
  });
});

describe("announcements service — bulk email (#14)", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("setEmailConfig calls actor with config object", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setEmailConfig: spy }) as any);
    const cfg = { resendApiKey: "re_test_key", fromEmail: "hoa@example.com", fromName: "Quorum HOA" };
    await setEmailConfig(cfg);
    expect(spy).toHaveBeenCalledWith(cfg);
  });

  it("setMembersCanisterId calls actor with canister ID string", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setMembersCanisterId: spy }) as any);
    await setMembersCanisterId("aaaaa-aa");
    expect(spy).toHaveBeenCalledWith("aaaaa-aa");
  });

  it("sendBulkEmail returns ok with sentCount for #All segment", async () => {
    const result = await sendBulkEmail("May Dues", "Please pay your dues.", { All: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.sentCount).toBe(BigInt(5));
    expect((result as any).ok.failedCount).toBe(BigInt(0));
  });

  it("sendBulkEmail passes subject, body, and segment to actor", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: MOCK_BULK_RESULT });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ sendBulkEmail: spy }) as any);
    await sendBulkEmail("Alert", "Body text", { ByRole: "BoardMember" });
    expect(spy).toHaveBeenCalledWith("Alert", "Body text", { ByRole: "BoardMember" });
  });

  it("sendBulkEmail accepts UnitIds segment variant", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: MOCK_BULK_RESULT });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ sendBulkEmail: spy }) as any);
    await sendBulkEmail("Delinquent Notice", "Pay now", { UnitIds: ["12A", "7B"] });
    expect(spy).toHaveBeenCalledWith("Delinquent Notice", "Pay now", { UnitIds: ["12A", "7B"] });
  });

  it("sendBulkEmail returns err when canister not deployed", async () => {
    (process.env as any).CANISTER_ID_ANNOUNCEMENTS = "";
    vi.resetModules();
    const { sendBulkEmail: fn } = await import("@/services/announcements");
    const result = await fn("subj", "body", { All: null });
    expect(result).toHaveProperty("err");
    (process.env as any).CANISTER_ID_ANNOUNCEMENTS = "rdmx6-jaaaa-aaaah-test-cai";
  });
});

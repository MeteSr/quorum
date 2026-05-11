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

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getActive:       vi.fn().mockResolvedValue([MOCK_NOTICE]),
    getUrgent:       vi.fn().mockResolvedValue([MOCK_URGENT]),
    getAll:          vi.fn().mockResolvedValue([MOCK_NOTICE, MOCK_URGENT]),
    post:            vi.fn().mockResolvedValue({ ok: MOCK_NOTICE }),
    delete:          vi.fn().mockResolvedValue({ ok: null }),
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

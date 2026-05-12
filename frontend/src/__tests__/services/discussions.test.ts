import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_DISCUSSIONS = "rdmx6-jaaaa-aaaah-disc-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  createPost,
  deletePost,
  addReply,
  pinPost,
  lockPost,
  getPost,
  getAllPosts,
  getPostsByCategory,
  getRepliesForPost,
  getPinnedPosts,
} from "@/services/discussions";

const MOCK_POST: any = {
  id:         "POST_1",
  title:      "Community BBQ this summer?",
  body:       "Anyone interested in organizing a BBQ?",
  category:   { General: null },
  isPinned:   false,
  isLocked:   false,
  postedBy:   { toText: () => "resident-principal" } as any,
  postedAt:   BigInt(1_700_000_000_000_000_000),
  replyCount: BigInt(0),
};

const MOCK_PINNED_POST: any = {
  ...MOCK_POST,
  id:       "POST_2",
  title:    "Important board notice",
  category: { FeedbackToBoard: null },
  isPinned: true,
};

const MOCK_REPLY: any = {
  id:       "REPLY_1",
  postId:   "POST_1",
  body:     "Count me in! I'll bring my grill.",
  postedBy: { toText: () => "neighbor-principal" } as any,
  postedAt: BigInt(1_700_000_001_000_000_000),
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    createPost:         vi.fn().mockResolvedValue({ ok: MOCK_POST }),
    deletePost:         vi.fn().mockResolvedValue({ ok: null }),
    addReply:           vi.fn().mockResolvedValue({ ok: MOCK_REPLY }),
    pinPost:            vi.fn().mockResolvedValue({ ok: { ...MOCK_POST, isPinned: true } }),
    lockPost:           vi.fn().mockResolvedValue({ ok: { ...MOCK_POST, isLocked: true } }),
    getPost:            vi.fn().mockResolvedValue([MOCK_POST]),
    getAllPosts:         vi.fn().mockResolvedValue([MOCK_POST, MOCK_PINNED_POST]),
    getPostsByCategory: vi.fn().mockResolvedValue([MOCK_POST]),
    getRepliesForPost:  vi.fn().mockResolvedValue([MOCK_REPLY]),
    getPinnedPosts:     vi.fn().mockResolvedValue([MOCK_PINNED_POST]),
    ...overrides,
  };
}

describe("discussions service — createPost", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created post", async () => {
    const result = await createPost("Community BBQ", "Anyone interested?", { General: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.id).toBe("POST_1");
  });

  it("passes category variant correctly", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await createPost("Plumber needed", "Looking for a plumber.", { NeighborHelp: null });
    expect(actor.createPost).toHaveBeenCalledWith("Plumber needed", "Looking for a plumber.", { NeighborHelp: null });
  });

  it("returns err NotAuthorized for anonymous caller", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ createPost: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await createPost("Title", "Body", { General: null });
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });

  it("returns err InvalidInput for empty title", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ createPost: vi.fn().mockResolvedValue({ err: { InvalidInput: "title required" } }) }) as any
    );
    const result = await createPost("", "Body", { General: null });
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("discussions service — deletePost", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok on successful deletion", async () => {
    const result = await deletePost("POST_1");
    expect(result).toHaveProperty("ok");
  });

  it("returns err NotFound for unknown post", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ deletePost: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await deletePost("POST_99");
    expect((result as any).err).toHaveProperty("NotFound");
  });

  it("returns err NotAuthorized when not the author", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ deletePost: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await deletePost("POST_2");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("discussions service — addReply", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the created reply", async () => {
    const result = await addReply("POST_1", "Count me in!");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.postId).toBe("POST_1");
  });

  it("returns err Locked for a locked post", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ addReply: vi.fn().mockResolvedValue({ err: { Locked: null } }) }) as any
    );
    const result = await addReply("POST_2", "This should fail.");
    expect((result as any).err).toHaveProperty("Locked");
  });

  it("returns err NotFound for unknown post", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ addReply: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await addReply("POST_99", "Hello");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("discussions service — pinPost / lockPost", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("pinPost returns ok with isPinned true", async () => {
    const result = await pinPost("POST_1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.isPinned).toBe(true);
  });

  it("lockPost returns ok with isLocked true", async () => {
    const result = await lockPost("POST_1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.isLocked).toBe(true);
  });

  it("pinPost returns err NotFound for unknown post", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ pinPost: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await pinPost("POST_99");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("discussions service — getPost", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns post when found", async () => {
    const result = await getPost("POST_1");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Community BBQ this summer?");
  });

  it("returns null when not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getPost: vi.fn().mockResolvedValue([]) }) as any
    );
    const result = await getPost("POST_99");
    expect(result).toBeNull();
  });
});

describe("discussions service — getAllPosts", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all posts", async () => {
    const results = await getAllPosts();
    expect(results).toHaveLength(2);
  });

  it("returns empty array when no posts", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllPosts: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllPosts()).toEqual([]);
  });
});

describe("discussions service — getPostsByCategory", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns posts filtered by category", async () => {
    const results = await getPostsByCategory({ General: null });
    expect(results).toHaveLength(1);
    expect(results[0].category).toEqual({ General: null });
  });

  it("passes category variant to actor", async () => {
    const actor = makeMockActor();
    vi.mocked(Actor.createActor).mockReturnValue(actor as any);
    await getPostsByCategory({ MaintenanceRepairs: null });
    expect(actor.getPostsByCategory).toHaveBeenCalledWith({ MaintenanceRepairs: null });
  });
});

describe("discussions service — getRepliesForPost", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns replies for a post", async () => {
    const results = await getRepliesForPost("POST_1");
    expect(results).toHaveLength(1);
    expect(results[0].postId).toBe("POST_1");
  });

  it("returns empty array when no replies", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getRepliesForPost: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getRepliesForPost("POST_2")).toEqual([]);
  });
});

describe("discussions service — getPinnedPosts", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns only pinned posts", async () => {
    const results = await getPinnedPosts();
    expect(results).toHaveLength(1);
    expect(results[0].isPinned).toBe(true);
  });

  it("returns empty array when no pinned posts", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getPinnedPosts: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getPinnedPosts()).toEqual([]);
  });
});

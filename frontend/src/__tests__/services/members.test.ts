import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_MEMBERS = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  getCommunityProfile,
  getAllMembers,
  getActiveMembers,
  getMyProfile,
  registerMember,
  generateInviteCode,
  createShareLink,
  getShareLink,
  revokeShareLink,
  getMyShareLinks,
  resendWelcomePacket,
  setCommunitySlug,
  setCustomDomain,
  setAccentColor,
  setPageBlocks,
  getWebsiteConfig,
  getPublicProfile,
  registerPushToken,
  removePushToken,
  getPushTokens,
} from "@/services/members";

const MOCK_COMMUNITY = {
  name: "Lakewood Heights HOA",
  address: "100 Lakewood Blvd",
  totalUnits: BigInt(120),
  description: "A great community",
  createdAt: BigInt(1_700_000_000_000_000_000),
};

const MOCK_WEBSITE_CONFIG = {
  slug:         ["lakewood-heights"],
  customDomain: [] as [],
  accentColor:  "#1B2D4F",
  pageBlocks:   [{ Text: "Welcome to Lakewood Heights." }],
};

const MOCK_PUBLIC_PROFILE = {
  name:         "Lakewood Heights HOA",
  address:      "100 Lakewood Blvd",
  totalUnits:   BigInt(120),
  description:  "A great community",
  accentColor:  "#1B2D4F",
  pageBlocks:   [{ Text: "Welcome to Lakewood Heights." }],
  memberCount:  BigInt(45),
  slug:         ["lakewood-heights"],
  customDomain: [] as [],
};

const MOCK_SHARE_LINK = {
  token:     "SHL-1-123456789",
  scope:     { Demo: null },
  createdBy: { toText: () => "test-principal" } as any,
  expiresAt: [] as [],
  isRevoked: false,
  viewCount: BigInt(0),
  createdAt: BigInt(1_700_000_000_000_000_000),
};

const MOCK_MEMBER = {
  principal: { toText: () => "test-principal" } as any,
  unitId: "12A",
  displayName: "Jane Smith",
  email: "jane@test.com",
  role: { Homeowner: null },
  joinedAt: BigInt(1_700_000_000_000_000_000),
  isActive: true,
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getCommunityProfile:      vi.fn().mockResolvedValue([MOCK_COMMUNITY]),
    getAllMembers:             vi.fn().mockResolvedValue([MOCK_MEMBER]),
    getActiveMembers:         vi.fn().mockResolvedValue([MOCK_MEMBER]),
    getMyProfile:             vi.fn().mockResolvedValue([MOCK_MEMBER]),
    registerMember:           vi.fn().mockResolvedValue({ ok: MOCK_MEMBER }),
    generateInviteCode:       vi.fn().mockResolvedValue({ ok: { code: "TEST-CODE", maxUses: BigInt(10), usedCount: BigInt(0), expiresAt: [], createdBy: {} as any, createdAt: BigInt(0), isRevoked: false } }),
    createShareLink:          vi.fn().mockResolvedValue({ ok: MOCK_SHARE_LINK }),
    getShareLink:             vi.fn().mockResolvedValue({ ok: MOCK_SHARE_LINK }),
    revokeShareLink:          vi.fn().mockResolvedValue({ ok: null }),
    getMyShareLinks:          vi.fn().mockResolvedValue({ ok: [MOCK_SHARE_LINK] }),
    resendWelcomePacket:      vi.fn().mockResolvedValue({ ok: null }),
    setCommunitySlug:         vi.fn().mockResolvedValue({ ok: MOCK_WEBSITE_CONFIG }),
    setCustomDomain:          vi.fn().mockResolvedValue({ ok: { ...MOCK_WEBSITE_CONFIG, customDomain: ["www.lakewood.com"] } }),
    setAccentColor:           vi.fn().mockResolvedValue({ ok: { ...MOCK_WEBSITE_CONFIG, accentColor: "#C94C2E" } }),
    setPageBlocks:            vi.fn().mockResolvedValue({ ok: MOCK_WEBSITE_CONFIG }),
    getWebsiteConfig:         vi.fn().mockResolvedValue({ ok: MOCK_WEBSITE_CONFIG }),
    getPublicProfile:         vi.fn().mockResolvedValue([MOCK_PUBLIC_PROFILE]),
    registerPushToken:        vi.fn().mockResolvedValue(undefined),
    removePushToken:          vi.fn().mockResolvedValue(undefined),
    getPushTokens:            vi.fn().mockResolvedValue({ ok: ["ExponentPushToken[xxx]"] }),
    ...overrides,
  };
}

describe("members service — getCommunityProfile", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the community profile", async () => {
    const profile = await getCommunityProfile();
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe("Lakewood Heights HOA");
  });

  it("returns null when actor returns empty optional", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getCommunityProfile: vi.fn().mockResolvedValue([]) }) as any);
    const profile = await getCommunityProfile();
    expect(profile).toBeNull();
  });
});

describe("members service — getAllMembers / getActiveMembers", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getAllMembers returns an array of members", async () => {
    const members = await getAllMembers();
    expect(members).toHaveLength(1);
    expect(members[0].displayName).toBe("Jane Smith");
  });

  it("getActiveMembers returns only active members", async () => {
    const members = await getActiveMembers();
    expect(members.every((m) => m.isActive)).toBe(true);
  });
});

describe("members service — getMyProfile", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns the authenticated user's member profile", async () => {
    const member = await getMyProfile();
    expect(member).not.toBeNull();
    expect(member!.unitId).toBe("12A");
  });

  it("returns null when caller is not registered", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getMyProfile: vi.fn().mockResolvedValue([]) }) as any);
    const member = await getMyProfile();
    expect(member).toBeNull();
  });
});

describe("members service — registerMember", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with member on success", async () => {
    const result = await registerMember("12A", "Jane Smith", "jane@test.com", "INVITE-01");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.displayName).toBe("Jane Smith");
  });

  it("returns err on duplicate registration", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ registerMember: vi.fn().mockResolvedValue({ err: { AlreadyExists: null } }) }) as any
    );
    const result = await registerMember("12A", "Jane Smith", "jane@test.com", "INVITE-01");
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("AlreadyExists");
  });

  it("returns err on invalid invite code", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ registerMember: vi.fn().mockResolvedValue({ err: { InvalidCode: "invite code not found" } }) }) as any
    );
    const result = await registerMember("12A", "Jane Smith", "jane@test.com", "BAD-CODE");
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("InvalidCode");
  });
});

describe("members service — generateInviteCode", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the invite code on success", async () => {
    const result = await generateInviteCode("TEST-CODE", BigInt(10), []);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.code).toBe("TEST-CODE");
  });
});

describe("members service — share links", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("createShareLink returns ok with the new link", async () => {
    const result = await createShareLink({ Demo: null }, []);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.token).toBe("SHL-1-123456789");
  });

  it("getShareLink returns ok with the link data", async () => {
    const result = await getShareLink("SHL-1-123456789");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.isRevoked).toBe(false);
  });

  it("getShareLink returns err when not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getShareLink: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await getShareLink("INVALID");
    expect(result).toHaveProperty("err");
  });

  it("revokeShareLink returns ok on success", async () => {
    const result = await revokeShareLink("SHL-1-123456789");
    expect(result).toHaveProperty("ok");
  });

  it("getMyShareLinks returns ok with array", async () => {
    const result = await getMyShareLinks();
    expect(result).toHaveProperty("ok");
    expect((result as any).ok).toHaveLength(1);
  });
});

describe("members service — resendWelcomePacket", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok on success", async () => {
    const result = await resendWelcomePacket(MOCK_MEMBER.principal);
    expect(result).toHaveProperty("ok");
  });

  it("returns err when member not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ resendWelcomePacket: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await resendWelcomePacket(MOCK_MEMBER.principal);
    expect(result).toHaveProperty("err");
  });
});

// ─── Website Config (#24) ─────────────────────────────────────────────────────

describe("members service — setCommunitySlug", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated website config", async () => {
    const result = await setCommunitySlug("lakewood-heights");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.slug).toEqual(["lakewood-heights"]);
  });

  it("returns err NotAuthorized when not board", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ setCommunitySlug: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await setCommunitySlug("bad-slug");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });

  it("returns err InvalidInput for slug with invalid characters", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ setCommunitySlug: vi.fn().mockResolvedValue({ err: { InvalidInput: "slug may only contain a-z, 0-9, and hyphens" } }) }) as any
    );
    const result = await setCommunitySlug("Sunset Palms!");
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("members service — setCustomDomain", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated customDomain", async () => {
    const result = await setCustomDomain("www.lakewood.com");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.customDomain).toEqual(["www.lakewood.com"]);
  });
});

describe("members service — setAccentColor", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated accentColor", async () => {
    const result = await setAccentColor("#C94C2E");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.accentColor).toBe("#C94C2E");
  });
});

describe("members service — setPageBlocks", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("passes page blocks array to actor", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: MOCK_WEBSITE_CONFIG });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ setPageBlocks: spy }) as any);
    const blocks = [{ Text: "Welcome!" }, { AnnouncementFeed: null }];
    await setPageBlocks(blocks);
    expect(spy).toHaveBeenCalledWith(blocks);
  });
});

describe("members service — getWebsiteConfig", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with current website config", async () => {
    const result = await getWebsiteConfig();
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.accentColor).toBe("#1B2D4F");
    expect((result as any).ok.pageBlocks).toHaveLength(1);
  });
});

describe("members service — getPublicProfile", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns merged public profile with website config", async () => {
    const profile = await getPublicProfile();
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe("Lakewood Heights HOA");
    expect(profile!.accentColor).toBe("#1B2D4F");
    expect(profile!.memberCount).toBe(BigInt(45));
    expect(profile!.slug).toEqual(["lakewood-heights"]);
  });

  it("returns null when community profile not configured", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getPublicProfile: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getPublicProfile()).toBeNull();
  });
});

// ─── Push Tokens (#42) ────────────────────────────────────────────────────────

describe("members service — registerPushToken", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("calls actor with the provided token string", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ registerPushToken: spy }) as any);
    await registerPushToken("ExponentPushToken[abc123]");
    expect(spy).toHaveBeenCalledWith("ExponentPushToken[abc123]");
  });

  it("resolves without error when canister is absent", async () => {
    (process.env as any).CANISTER_ID_MEMBERS = "";
    vi.resetModules();
    const { registerPushToken: fn } = await import("@/services/members");
    await expect(fn("token")).resolves.toBeUndefined();
    (process.env as any).CANISTER_ID_MEMBERS = "rdmx6-jaaaa-aaaah-test-cai";
  });
});

describe("members service — removePushToken", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("calls actor removePushToken with no arguments", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ removePushToken: spy }) as any);
    await removePushToken();
    expect(spy).toHaveBeenCalledWith();
  });
});

describe("members service — getPushTokens", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with array of token strings", async () => {
    const result = await getPushTokens();
    expect(result).toHaveProperty("ok");
    expect((result as any).ok).toContain("ExponentPushToken[xxx]");
  });

  it("returns err NotAuthorized for non-board caller", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getPushTokens: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await getPushTokens();
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

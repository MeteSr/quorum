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
} from "@/services/members";

const MOCK_COMMUNITY = {
  name: "Lakewood Heights HOA",
  address: "100 Lakewood Blvd",
  totalUnits: BigInt(120),
  description: "A great community",
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
    getCommunityProfile:  vi.fn().mockResolvedValue([MOCK_COMMUNITY]),
    getAllMembers:         vi.fn().mockResolvedValue([MOCK_MEMBER]),
    getActiveMembers:     vi.fn().mockResolvedValue([MOCK_MEMBER]),
    getMyProfile:         vi.fn().mockResolvedValue([MOCK_MEMBER]),
    registerMember:       vi.fn().mockResolvedValue({ ok: MOCK_MEMBER }),
    generateInviteCode:   vi.fn().mockResolvedValue({ ok: { code: "TEST-CODE", maxUses: BigInt(10), usedCount: BigInt(0), expiresAt: [], createdBy: {} as any, createdAt: BigInt(0), isRevoked: false } }),
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

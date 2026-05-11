import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_GOVERNANCE = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  getOpenProposals,
  getAllProposals,
  createProposal,
  castVote,
} from "@/services/governance";

const MOCK_PROPOSAL = {
  id: "prop-1",
  title: "Repave the parking lot",
  description: "The east lot needs repaving before winter.",
  proposer: { toText: () => "board-principal" } as any,
  status: { Open: null },
  votingDeadline: BigInt(1_800_000_000_000_000_000),
  quorumPercent: BigInt(51),
  yesVotes:     BigInt(14),
  noVotes:      BigInt(3),
  abstainVotes: BigInt(1),
  createdAt:    BigInt(1_700_000_000_000_000_000),
};

const MOCK_VOTE = {
  proposalId: "prop-1",
  voter:  { toText: () => "member-principal" } as any,
  choice: { Yes: null },
  castAt: BigInt(1_700_000_000_000_000_000),
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getOpenProposals: vi.fn().mockResolvedValue([MOCK_PROPOSAL]),
    getAllProposals:   vi.fn().mockResolvedValue([MOCK_PROPOSAL]),
    createProposal:   vi.fn().mockResolvedValue({ ok: MOCK_PROPOSAL }),
    castVote:         vi.fn().mockResolvedValue({ ok: MOCK_VOTE }),
    ...overrides,
  };
}

describe("governance service — getOpenProposals / getAllProposals", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getOpenProposals returns proposals with Open status", async () => {
    const proposals = await getOpenProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toEqual({ Open: null });
  });

  it("getAllProposals returns all proposals", async () => {
    const proposals = await getAllProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].title).toBe("Repave the parking lot");
  });

  it("returns empty array when no proposals exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({
      getOpenProposals: vi.fn().mockResolvedValue([]),
    }) as any);
    expect(await getOpenProposals()).toEqual([]);
  });
});

describe("governance service — createProposal", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with created proposal", async () => {
    const deadline = BigInt(1_800_000_000_000_000_000);
    const result = await createProposal("New gate code", "Change the gate code annually", deadline, BigInt(51));
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.title).toBe("Repave the parking lot"); // mock always returns MOCK_PROPOSAL
  });

  it("returns err when caller is not a board member", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ createProposal: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await createProposal("Title", "Desc", BigInt(0), BigInt(51));
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("governance service — castVote", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with the cast vote", async () => {
    const result = await castVote("prop-1", { Yes: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.choice).toEqual({ Yes: null });
  });

  it("returns err when proposal is not open", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ castVote: vi.fn().mockResolvedValue({ err: { NotOpen: null } }) }) as any
    );
    const result = await castVote("prop-1", { Yes: null });
    expect(result).toHaveProperty("err");
    expect((result as any).err).toHaveProperty("NotOpen");
  });

  it("returns err when member already voted", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ castVote: vi.fn().mockResolvedValue({ err: { AlreadyVoted: null } }) }) as any
    );
    const result = await castVote("prop-1", { No: null });
    expect((result as any).err).toHaveProperty("AlreadyVoted");
  });
});

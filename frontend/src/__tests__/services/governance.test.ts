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
  createPoll,
  castPollVote,
  closePoll,
  getOpenPolls,
  getAllPolls,
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

const MOCK_POLL = {
  id: "POLL_1",
  question: "Should we move the meeting to Thursday?",
  options: [
    { text: "Yes", votes: BigInt(5) },
    { text: "No",  votes: BigInt(2) },
  ],
  status: { Open: null },
  showLiveResults: true,
  anonymous: false,
  createdBy: { toText: () => "board-principal" } as any,
  deadline:  BigInt(1_800_000_000_000_000_000),
  createdAt: BigInt(1_700_000_000_000_000_000),
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getOpenProposals: vi.fn().mockResolvedValue([MOCK_PROPOSAL]),
    getAllProposals:   vi.fn().mockResolvedValue([MOCK_PROPOSAL]),
    createProposal:   vi.fn().mockResolvedValue({ ok: MOCK_PROPOSAL }),
    castVote:         vi.fn().mockResolvedValue({ ok: MOCK_VOTE }),
    createPoll:       vi.fn().mockResolvedValue({ ok: MOCK_POLL }),
    castPollVote:     vi.fn().mockResolvedValue({ ok: MOCK_POLL }),
    closePoll:        vi.fn().mockResolvedValue({ ok: { ...MOCK_POLL, status: { Closed: null } } }),
    getOpenPolls:     vi.fn().mockResolvedValue([MOCK_POLL]),
    getAllPolls:       vi.fn().mockResolvedValue([MOCK_POLL]),
    ...overrides,
  };
}

// ─── Proposal tests ──────────────────────────────────────────────────────────

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

// ─── Poll tests ───────────────────────────────────────────────────────────────

describe("governance service — createPoll", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with created poll", async () => {
    const result = await createPoll("Thursday move?", ["Yes", "No"], BigInt(1_800_000_000_000_000_000), true, false);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.question).toBe("Should we move the meeting to Thursday?");
  });

  it("returns err for empty question", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ createPoll: vi.fn().mockResolvedValue({ err: { InvalidInput: "question required" } }) }) as any
    );
    const result = await createPoll("", ["Yes", "No"], BigInt(0), false, false);
    expect((result as any).err).toHaveProperty("InvalidInput");
  });

  it("returns err for fewer than 2 options", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ createPoll: vi.fn().mockResolvedValue({ err: { InvalidInput: "poll requires 2-5 options" } }) }) as any
    );
    const result = await createPoll("Question?", ["Only one"], BigInt(0), false, false);
    expect((result as any).err).toHaveProperty("InvalidInput");
  });
});

describe("governance service — castPollVote", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated poll", async () => {
    const result = await castPollVote("POLL_1", BigInt(0));
    expect(result).toHaveProperty("ok");
  });

  it("returns err when poll is closed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ castPollVote: vi.fn().mockResolvedValue({ err: { AlreadyClosed: null } }) }) as any
    );
    const result = await castPollVote("POLL_1", BigInt(0));
    expect((result as any).err).toHaveProperty("AlreadyClosed");
  });

  it("returns err when deadline has passed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ castPollVote: vi.fn().mockResolvedValue({ err: { DeadlinePassed: null } }) }) as any
    );
    const result = await castPollVote("POLL_1", BigInt(0));
    expect((result as any).err).toHaveProperty("DeadlinePassed");
  });
});

describe("governance service — getOpenPolls / getAllPolls", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("getOpenPolls returns open polls", async () => {
    const polls = await getOpenPolls();
    expect(polls).toHaveLength(1);
    expect(polls[0].status).toEqual({ Open: null });
  });

  it("getAllPolls returns all polls including closed", async () => {
    const polls = await getAllPolls();
    expect(polls).toHaveLength(1);
    expect(polls[0].question).toBe("Should we move the meeting to Thursday?");
  });

  it("returns empty array when no polls exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllPolls: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllPolls()).toEqual([]);
  });
});

describe("governance service — closePoll", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with poll set to Closed status", async () => {
    const result = await closePoll("POLL_1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.status).toEqual({ Closed: null });
  });

  it("returns err when caller did not create the poll", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ closePoll: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await closePoll("POLL_1");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });

  it("returns err when poll is already closed", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ closePoll: vi.fn().mockResolvedValue({ err: { AlreadyClosed: null } }) }) as any
    );
    const result = await closePoll("POLL_1");
    expect((result as any).err).toHaveProperty("AlreadyClosed");
  });
});

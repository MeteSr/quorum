import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_GOVERNANCE = (process.env as any).CANISTER_ID_GOVERNANCE || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const ProposalStatus = IDL.Variant({
    Draft:     IDL.Null,
    Open:      IDL.Null,
    Passed:    IDL.Null,
    Failed:    IDL.Null,
    Cancelled: IDL.Null,
  });

  const VoteChoice = IDL.Variant({
    Yes:     IDL.Null,
    No:      IDL.Null,
    Abstain: IDL.Null,
  });

  const Proposal = IDL.Record({
    id:             IDL.Text,
    title:          IDL.Text,
    description:    IDL.Text,
    proposer:       IDL.Principal,
    status:         ProposalStatus,
    votingDeadline: IDL.Int,
    quorumPercent:  IDL.Nat,
    yesVotes:       IDL.Nat,
    noVotes:        IDL.Nat,
    abstainVotes:   IDL.Nat,
    createdAt:      IDL.Int,
  });

  const Vote = IDL.Record({
    proposalId: IDL.Text,
    voter:      IDL.Principal,
    choice:     VoteChoice,
    castAt:     IDL.Int,
  });

  const PollStatus = IDL.Variant({ Open: IDL.Null, Closed: IDL.Null });

  const PollOption = IDL.Record({ text: IDL.Text, votes: IDL.Nat });

  const Poll = IDL.Record({
    id:              IDL.Text,
    question:        IDL.Text,
    options:         IDL.Vec(PollOption),
    status:          PollStatus,
    showLiveResults: IDL.Bool,
    anonymous:       IDL.Bool,
    createdBy:       IDL.Principal,
    deadline:        IDL.Int,
    createdAt:       IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:       IDL.Null,
    NotAuthorized:  IDL.Null,
    InvalidInput:   IDL.Text,
    DeadlinePassed: IDL.Null,
    AlreadyVoted:   IDL.Null,
    NotOpen:        IDL.Null,
    AlreadyClosed:  IDL.Null,
  });

  const ResultProposal = IDL.Variant({ ok: Proposal, err: Error });
  const ResultVote     = IDL.Variant({ ok: Vote,     err: Error });
  const ResultPoll     = IDL.Variant({ ok: Poll,     err: Error });

  return IDL.Service({
    setMembersCanisterId: IDL.Func([IDL.Text],                              [],               []),
    createProposal:       IDL.Func([IDL.Text, IDL.Text, IDL.Int, IDL.Nat], [ResultProposal], []),
    openProposal:         IDL.Func([IDL.Text],                              [ResultProposal], []),
    castVote:             IDL.Func([IDL.Text, VoteChoice],                  [ResultVote],     []),
    finalizeProposal:     IDL.Func([IDL.Text],                              [ResultProposal], []),
    getProposal:          IDL.Func([IDL.Text],                              [IDL.Opt(Proposal)], ["query"]),
    getOpenProposals:     IDL.Func([],                                      [IDL.Vec(Proposal)], ["query"]),
    getAllProposals:       IDL.Func([],                                      [IDL.Vec(Proposal)], ["query"]),
    getMyVote:            IDL.Func([IDL.Text, IDL.Principal],               [IDL.Opt(Vote)],     ["query"]),
    // Poll methods
    createPoll:           IDL.Func([IDL.Text, IDL.Vec(IDL.Text), IDL.Int, IDL.Bool, IDL.Bool], [ResultPoll], []),
    castPollVote:         IDL.Func([IDL.Text, IDL.Nat],                     [ResultPoll], []),
    closePoll:            IDL.Func([IDL.Text],                              [ResultPoll], []),
    getPoll:              IDL.Func([IDL.Text],                              [IDL.Opt(Poll)], ["query"]),
    getOpenPolls:         IDL.Func([],                                      [IDL.Vec(Poll)], ["query"]),
    getAllPolls:           IDL.Func([],                                      [IDL.Vec(Poll)], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProposalStatus = { Draft: null } | { Open: null } | { Passed: null } | { Failed: null } | { Cancelled: null };
export type VoteChoice     = { Yes: null } | { No: null } | { Abstain: null };

export interface Proposal {
  id:             string;
  title:          string;
  description:    string;
  proposer:       import("@dfinity/principal").Principal;
  status:         ProposalStatus;
  votingDeadline: bigint;
  quorumPercent:  bigint;
  yesVotes:       bigint;
  noVotes:        bigint;
  abstainVotes:   bigint;
  createdAt:      bigint;
}

export interface Vote {
  proposalId: string;
  voter:      import("@dfinity/principal").Principal;
  choice:     VoteChoice;
  castAt:     bigint;
}

export type PollStatus = { Open: null } | { Closed: null };

export interface PollOption {
  text:  string;
  votes: bigint;
}

export interface Poll {
  id:              string;
  question:        string;
  options:         PollOption[];
  status:          PollStatus;
  showLiveResults: boolean;
  anonymous:       boolean;
  createdBy:       import("@dfinity/principal").Principal;
  deadline:        bigint;
  createdAt:       bigint;
}

export type GovernanceError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { DeadlinePassed: null }
  | { AlreadyVoted: null }
  | { NotOpen: null }
  | { AlreadyClosed: null };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_GOVERNANCE) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_GOVERNANCE });
}

// ─── Proposal service ─────────────────────────────────────────────────────────

export async function getAllProposals(): Promise<Proposal[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllProposals();
}

export async function getOpenProposals(): Promise<Proposal[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getOpenProposals();
}

export async function createProposal(
  title: string, description: string, votingDeadline: bigint, quorumPercent: bigint
): Promise<{ ok: Proposal } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.createProposal(title, description, votingDeadline, quorumPercent);
}

export async function castVote(
  proposalId: string, choice: VoteChoice
): Promise<{ ok: Vote } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.castVote(proposalId, choice);
}

// ─── Poll service ─────────────────────────────────────────────────────────────

export async function getAllPolls(): Promise<Poll[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllPolls();
}

export async function getOpenPolls(): Promise<Poll[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getOpenPolls();
}

export async function createPoll(
  question: string,
  optionTexts: string[],
  deadline: bigint,
  showLiveResults: boolean,
  anonymous: boolean
): Promise<{ ok: Poll } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.createPoll(question, optionTexts, deadline, showLiveResults, anonymous);
}

export async function castPollVote(
  pollId: string,
  optionIdx: bigint
): Promise<{ ok: Poll } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.castPollVote(pollId, optionIdx);
}

export async function closePoll(
  pollId: string
): Promise<{ ok: Poll } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.closePoll(pollId);
}

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
    NotFound:        IDL.Null,
    NotAuthorized:   IDL.Null,
    InvalidInput:    IDL.Text,
    DeadlinePassed:  IDL.Null,
    AlreadyVoted:    IDL.Null,
    NotOpen:         IDL.Null,
    AlreadyClosed:   IDL.Null,
    ElectionNotOver: IDL.Null,
    AlreadyNominated:IDL.Null,
  });

  const ElectionType   = IDL.Variant({ BoardSeat: IDL.Null, ByLawAmendment: IDL.Null, SpecialAssessment: IDL.Null });
  const ElectionStatus = IDL.Variant({ Active: IDL.Null, Certified: IDL.Null, Cancelled: IDL.Null });

  const Election = IDL.Record({
    id:                 IDL.Text,
    title:              IDL.Text,
    electionType:       ElectionType,
    nominationDeadline: IDL.Int,
    votingOpen:         IDL.Int,
    votingClose:        IDL.Int,
    quorumPercent:      IDL.Nat,
    seats:              IDL.Opt(IDL.Nat),
    totalEligibleUnits: IDL.Nat,
    status:             ElectionStatus,
    createdBy:          IDL.Principal,
    createdAt:          IDL.Int,
  });

  const Nomination = IDL.Record({
    id:          IDL.Text,
    electionId:  IDL.Text,
    candidate:   IDL.Principal,
    nominatedBy: IDL.Principal,
    bio:         IDL.Text,
    photoHash:   IDL.Opt(IDL.Text),
    createdAt:   IDL.Int,
  });

  const BallotChoice = IDL.Variant({
    Candidates: IDL.Vec(IDL.Principal),
    YeaNay:     IDL.Bool,
  });

  const Ballot = IDL.Record({
    id:         IDL.Text,
    electionId: IDL.Text,
    voter:      IDL.Principal,
    choice:     BallotChoice,
    castAt:     IDL.Int,
  });

  const CandidateTally = IDL.Record({ candidate: IDL.Principal, votes: IDL.Nat });

  const ElectionResult = IDL.Record({
    electionId:    IDL.Text,
    yeaVotes:      IDL.Nat,
    nayVotes:      IDL.Nat,
    tallies:       IDL.Vec(CandidateTally),
    totalBallots:  IDL.Nat,
    quorumReached: IDL.Bool,
    passed:        IDL.Bool,
    certifiedAt:   IDL.Int,
  });

  const ResultElection       = IDL.Variant({ ok: Election,       err: Error });
  const ResultNomination     = IDL.Variant({ ok: Nomination,     err: Error });
  const ResultBallot         = IDL.Variant({ ok: Ballot,         err: Error });
  const ResultElectionResult = IDL.Variant({ ok: ElectionResult, err: Error });

  const ResultProposal = IDL.Variant({ ok: Proposal, err: Error });
  const ResultVote     = IDL.Variant({ ok: Vote,     err: Error });
  const ResultPoll     = IDL.Variant({ ok: Poll,     err: Error });

  return IDL.Service({
    setMembersCanisterId:    IDL.Func([IDL.Text],                              [],               []),
    setWelcomePacketConfig:  IDL.Func([IDL.Vec(IDL.Text), IDL.Text, IDL.Text, IDL.Text], [], []),
    getWelcomePacketConfig:  IDL.Func([], [IDL.Opt(IDL.Record({
      pinnedDocIds:  IDL.Vec(IDL.Text),
      contactCard:   IDL.Text,
      amenityNotes:  IDL.Text,
      customMessage: IDL.Text,
      updatedAt:     IDL.Int,
    }))], ["query"]),
    // Election methods
    createElection:    IDL.Func([IDL.Text, ElectionType, IDL.Int, IDL.Int, IDL.Int, IDL.Nat, IDL.Nat, IDL.Opt(IDL.Nat)], [ResultElection],       []),
    nominateSelf:      IDL.Func([IDL.Text, IDL.Text, IDL.Opt(IDL.Text)],                                                 [ResultNomination],     []),
    nominateOwner:     IDL.Func([IDL.Text, IDL.Principal, IDL.Text],                                                     [ResultNomination],     []),
    castBallot:        IDL.Func([IDL.Text, BallotChoice],                                                                [ResultBallot],         []),
    certifyResults:    IDL.Func([IDL.Text],                                                                              [ResultElectionResult], []),
    cancelElection:    IDL.Func([IDL.Text],                                                                              [ResultElection],       []),
    getElection:       IDL.Func([IDL.Text],             [IDL.Opt(Election)],      ["query"]),
    getAllElections:   IDL.Func([],                     [IDL.Vec(Election)],      ["query"]),
    getActiveElections:IDL.Func([],                     [IDL.Vec(Election)],      ["query"]),
    getNominations:    IDL.Func([IDL.Text],             [IDL.Vec(Nomination)],    ["query"]),
    getElectionResult: IDL.Func([IDL.Text],             [IDL.Opt(ElectionResult)],["query"]),
    getBallots:        IDL.Func([IDL.Text],             [IDL.Opt(IDL.Vec(Ballot))],["query"]),
    hasVoted:          IDL.Func([IDL.Text, IDL.Principal],[IDL.Bool],             ["query"]),
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
  | { AlreadyClosed: null }
  | { ElectionNotOver: null }
  | { AlreadyNominated: null };

// ─── Election Types ────────────────────────────────────────────────────────

export type ElectionType   = { BoardSeat: null } | { ByLawAmendment: null } | { SpecialAssessment: null };
export type ElectionStatus = { Active: null } | { Certified: null } | { Cancelled: null };

export interface Election {
  id:                 string;
  title:              string;
  electionType:       ElectionType;
  nominationDeadline: bigint;
  votingOpen:         bigint;
  votingClose:        bigint;
  quorumPercent:      bigint;
  seats:              [] | [bigint];
  totalEligibleUnits: bigint;
  status:             ElectionStatus;
  createdBy:          import("@dfinity/principal").Principal;
  createdAt:          bigint;
}

export interface Nomination {
  id:          string;
  electionId:  string;
  candidate:   import("@dfinity/principal").Principal;
  nominatedBy: import("@dfinity/principal").Principal;
  bio:         string;
  photoHash:   [] | [string];
  createdAt:   bigint;
}

export type BallotChoice =
  | { Candidates: import("@dfinity/principal").Principal[] }
  | { YeaNay: boolean };

export interface Ballot {
  id:         string;
  electionId: string;
  voter:      import("@dfinity/principal").Principal;
  choice:     BallotChoice;
  castAt:     bigint;
}

export interface CandidateTally {
  candidate: import("@dfinity/principal").Principal;
  votes:     bigint;
}

export interface ElectionResult {
  electionId:    string;
  yeaVotes:      bigint;
  nayVotes:      bigint;
  tallies:       CandidateTally[];
  totalBallots:  bigint;
  quorumReached: boolean;
  passed:        boolean;
  certifiedAt:   bigint;
}

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

// ─── Election service ─────────────────────────────────────────────────────

export async function getAllElections(): Promise<Election[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllElections();
}

export async function getActiveElections(): Promise<Election[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getActiveElections();
}

export async function createElection(
  title: string,
  electionType: ElectionType,
  nominationDeadline: bigint,
  votingOpen: bigint,
  votingClose: bigint,
  quorumPercent: bigint,
  totalEligibleUnits: bigint,
  seats: [] | [bigint]
): Promise<{ ok: Election } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.createElection(title, electionType, nominationDeadline, votingOpen, votingClose, quorumPercent, totalEligibleUnits, seats);
}

export async function nominateSelf(
  electionId: string,
  bio: string,
  photoHash: [] | [string]
): Promise<{ ok: Nomination } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.nominateSelf(electionId, bio, photoHash);
}

export async function castBallot(
  electionId: string,
  choice: BallotChoice
): Promise<{ ok: Ballot } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.castBallot(electionId, choice);
}

export async function certifyResults(
  electionId: string
): Promise<{ ok: ElectionResult } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.certifyResults(electionId);
}

export async function cancelElection(
  electionId: string
): Promise<{ ok: Election } | { err: GovernanceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.cancelElection(electionId);
}

export async function getNominations(electionId: string): Promise<Nomination[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getNominations(electionId);
}

export async function getElectionResult(electionId: string): Promise<ElectionResult | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [ElectionResult] = await actor.getElectionResult(electionId);
  return result.length > 0 ? result[0]! : null;
}

export async function getBallots(electionId: string): Promise<Ballot[] | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [Ballot[]] = await actor.getBallots(electionId);
  return result.length > 0 ? result[0]! : null;
}

export async function hasVoted(
  electionId: string,
  voter: import("@dfinity/principal").Principal
): Promise<boolean> {
  const actor = await createActor() as any;
  if (!actor) return false;
  return actor.hasVoted(electionId, voter);
}

// ─── Welcome Packet Config (#40) ─────────────────────────────────────────────

export interface WelcomePacketConfig {
  pinnedDocIds:  string[];
  contactCard:   string;
  amenityNotes:  string;
  customMessage: string;
  updatedAt:     bigint;
}

export async function getWelcomePacketConfig(): Promise<WelcomePacketConfig | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getWelcomePacketConfig() as [] | [WelcomePacketConfig];
  return result[0] ?? null;
}

export async function setWelcomePacketConfig(
  pinnedDocIds:  string[],
  contactCard:   string,
  amenityNotes:  string,
  customMessage: string
): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  return actor.setWelcomePacketConfig(pinnedDocIds, contactCard, amenityNotes, customMessage);
}

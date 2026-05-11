/**
 * Quorum — Governance Canister
 *
 * On-chain proposals and voting.
 * Supports simple-majority and supermajority thresholds.
 * Votes are immutably recorded; results are tallied on finalization.
 *
 * Quick Polls: lightweight non-binding pulse checks (issue #38).
 * Polls differ from proposals: no quorum rules, re-voting allowed until deadline.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Governance {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type ProposalStatus = {
    #Draft;
    #Open;
    #Passed;
    #Failed;
    #Cancelled;
  };

  public type VoteChoice = { #Yes; #No; #Abstain };

  public type Proposal = {
    id:            Text;
    title:         Text;
    description:   Text;
    proposer:      Principal;
    status:        ProposalStatus;
    votingDeadline: Time.Time;
    quorumPercent: Nat;   // 0-100; e.g. 51 = simple majority
    yesVotes:      Nat;
    noVotes:       Nat;
    abstainVotes:  Nat;
    createdAt:     Time.Time;
  };

  public type Vote = {
    proposalId: Text;
    voter:      Principal;
    choice:     VoteChoice;
    castAt:     Time.Time;
  };

  public type PollStatus = { #Open; #Closed };

  public type PollOption = {
    text:  Text;
    votes: Nat;
  };

  public type Poll = {
    id:              Text;
    question:        Text;
    options:         [PollOption];
    status:          PollStatus;
    showLiveResults: Bool;
    anonymous:       Bool;
    createdBy:       Principal;
    deadline:        Time.Time;
    createdAt:       Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #DeadlinePassed;
    #AlreadyVoted;
    #NotOpen;
    #AlreadyClosed;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var proposalCounter : Nat = 0;
  private var pollCounter     : Nat = 0;
  private var membersCanisterId : Text = "";
  private let proposals  = Map.empty<Text, Proposal>();
  private let votes      = Map.empty<Text, Vote>();      // key: proposalId # "_" # principalText
  private let polls      = Map.empty<Text, Poll>();
  private let pollVotes  = Map.empty<Text, Nat>();       // key: pollId # "_" # principalText, value: optionIdx

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextProposalId() : Text {
    proposalCounter += 1;
    "PROP_" # Nat.toText(proposalCounter)
  };

  private func voteKey(proposalId : Text, voter : Principal) : Text {
    proposalId # "_" # Principal.toText(voter)
  };

  private func nextPollId() : Text {
    pollCounter += 1;
    "POLL_" # Nat.toText(pollCounter)
  };

  private func pollVoteKey(pollId : Text, voter : Principal) : Text {
    pollId # "_" # Principal.toText(voter)
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────────

  public shared func setMembersCanisterId(id : Text) : async () {
    membersCanisterId := id;
  };

  // ─── Proposals ───────────────────────────────────────────────────────────────

  public shared(msg) func createProposal(
    title:          Text,
    description:    Text,
    votingDeadline: Time.Time,
    quorumPercent:  Nat
  ) : async Result.Result<Proposal, Error> {
    if (quorumPercent > 100) return #err(#InvalidInput("quorumPercent must be 0-100"));
    let proposal : Proposal = {
      id             = nextProposalId();
      title;
      description;
      proposer       = msg.caller;
      status         = #Draft;
      votingDeadline;
      quorumPercent;
      yesVotes       = 0;
      noVotes        = 0;
      abstainVotes   = 0;
      createdAt      = Time.now();
    };
    Map.add(proposals, Text.compare, proposal.id, proposal);
    #ok(proposal)
  };

  public shared(msg) func openProposal(id : Text) : async Result.Result<Proposal, Error> {
    switch (Map.get(proposals, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?proposal)  {
        if (proposal.proposer != msg.caller) return #err(#NotAuthorized);
        let updated = { proposal with status = #Open };
        Map.add(proposals, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func castVote(
    proposalId : Text,
    choice     : VoteChoice
  ) : async Result.Result<Vote, Error> {
    switch (Map.get(proposals, Text.compare, proposalId)) {
      case null  { #err(#NotFound) };
      case (?proposal)  {
        if (proposal.status != #Open)              return #err(#NotOpen);
        if (Time.now() > proposal.votingDeadline)  return #err(#DeadlinePassed);
        let key = voteKey(proposalId, msg.caller);
        if (Map.get(votes, Text.compare, key) != null) return #err(#AlreadyVoted);

        let vote : Vote = {
          proposalId;
          voter  = msg.caller;
          choice;
          castAt = Time.now();
        };
        Map.add(votes, Text.compare, key, vote);

        let updated = switch (choice) {
          case (#Yes)     { { proposal with yesVotes     = proposal.yesVotes     + 1 } };
          case (#No)      { { proposal with noVotes      = proposal.noVotes      + 1 } };
          case (#Abstain) { { proposal with abstainVotes = proposal.abstainVotes + 1 } };
        };
        Map.add(proposals, Text.compare, proposalId, updated);
        #ok(vote)
      };
    }
  };

  public shared(msg) func finalizeProposal(id : Text) : async Result.Result<Proposal, Error> {
    switch (Map.get(proposals, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?proposal)  {
        if (proposal.status != #Open) return #err(#NotOpen);
        let total = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
        let passed = total > 0 and (proposal.yesVotes * 100 / total >= proposal.quorumPercent);
        let updated = { proposal with status = if (passed) #Passed else #Failed };
        Map.add(proposals, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Proposal Queries ────────────────────────────────────────────────────────

  public query func getProposal(id : Text) : async ?Proposal {
    Map.get(proposals, Text.compare, id)
  };

  public query func getOpenProposals() : async [Proposal] {
    Array.filter<Proposal>(Iter.toArray(Map.values(proposals)), func(proposal) { proposal.status == #Open })
  };

  public query func getAllProposals() : async [Proposal] {
    Iter.toArray(Map.values(proposals))
  };

  public query func getMyVote(proposalId : Text, voter : Principal) : async ?Vote {
    Map.get(votes, Text.compare, voteKey(proposalId, voter))
  };

  // ─── Polls ────────────────────────────────────────────────────────────────────

  public shared(msg) func createPoll(
    question:        Text,
    optionTexts:     [Text],
    deadline:        Time.Time,
    showLiveResults: Bool,
    anonymous:       Bool
  ) : async Result.Result<Poll, Error> {
    if (Text.size(question) == 0) return #err(#InvalidInput("question required"));
    if (optionTexts.size() < 2)   return #err(#InvalidInput("poll requires 2-5 options"));
    if (optionTexts.size() > 5)   return #err(#InvalidInput("poll requires 2-5 options"));
    let options = Array.map<Text, PollOption>(optionTexts, func(text) { { text; votes = 0 } });
    let poll : Poll = {
      id              = nextPollId();
      question;
      options;
      status          = #Open;
      showLiveResults;
      anonymous;
      createdBy       = msg.caller;
      deadline;
      createdAt       = Time.now();
    };
    Map.add(polls, Text.compare, poll.id, poll);
    #ok(poll)
  };

  public shared(msg) func castPollVote(
    pollId    : Text,
    optionIdx : Nat
  ) : async Result.Result<Poll, Error> {
    switch (Map.get(polls, Text.compare, pollId)) {
      case null { #err(#NotFound) };
      case (?poll) {
        if (poll.status == #Closed)           return #err(#AlreadyClosed);
        if (Time.now() > poll.deadline)       return #err(#DeadlinePassed);
        if (optionIdx >= poll.options.size()) return #err(#InvalidInput("optionIdx out of range"));
        let key = pollVoteKey(pollId, msg.caller);
        let existingVoteIdx = Map.get(pollVotes, Text.compare, key);
        let newOptions = Array.tabulate<PollOption>(poll.options.size(), func(idx) {
          let option = poll.options[idx];
          var voteCount = option.votes;
          switch (existingVoteIdx) {
            case (?oldIdx) { if (idx == oldIdx and voteCount > 0) { voteCount -= 1 } };
            case null      { };
          };
          if (idx == optionIdx) { voteCount += 1 };
          { text = option.text; votes = voteCount }
        });
        Map.add(pollVotes, Text.compare, key, optionIdx);
        let updated = { poll with options = newOptions };
        Map.add(polls, Text.compare, pollId, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func closePoll(pollId : Text) : async Result.Result<Poll, Error> {
    switch (Map.get(polls, Text.compare, pollId)) {
      case null { #err(#NotFound) };
      case (?poll) {
        if (poll.createdBy != msg.caller) return #err(#NotAuthorized);
        if (poll.status == #Closed)        return #err(#AlreadyClosed);
        let updated = { poll with status = #Closed };
        Map.add(polls, Text.compare, pollId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Poll Queries ─────────────────────────────────────────────────────────────

  public query func getPoll(id : Text) : async ?Poll {
    Map.get(polls, Text.compare, id)
  };

  public query func getOpenPolls() : async [Poll] {
    Array.filter<Poll>(Iter.toArray(Map.values(polls)), func(poll) { poll.status == #Open })
  };

  public query func getAllPolls() : async [Poll] {
    Iter.toArray(Map.values(polls))
  };
};

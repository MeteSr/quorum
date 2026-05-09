/**
 * Quorum — Governance Canister
 *
 * On-chain proposals and voting.
 * Supports simple-majority and supermajority thresholds.
 * Votes are immutably recorded; results are tallied on finalization.
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
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

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #DeadlinePassed;
    #AlreadyVoted;
    #NotOpen;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var proposalCounter : Nat = 0;
  private var membersCanisterId : Text = "";
  private let proposals = Map.empty<Text, Proposal>();
  private let votes     = Map.empty<Text, Vote>();  // key: proposalId # "_" # principalText

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    proposalCounter += 1;
    "PROP_" # Nat.toText(proposalCounter)
  };

  private func voteKey(proposalId : Text, voter : Principal) : Text {
    proposalId # "_" # Principal.toText(voter)
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
    let p : Proposal = {
      id             = nextId();
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
    Map.add(proposals, Text.compare, p.id, p);
    #ok(p)
  };

  public shared(msg) func openProposal(id : Text) : async Result.Result<Proposal, Error> {
    switch (Map.get(proposals, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?p)  {
        if (p.proposer != msg.caller) return #err(#NotAuthorized);
        let updated = { p with status = #Open };
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
      case (?p)  {
        if (p.status != #Open)            return #err(#NotOpen);
        if (Time.now() > p.votingDeadline) return #err(#DeadlinePassed);
        let key = voteKey(proposalId, msg.caller);
        if (Map.contains(votes, Text.compare, key)) return #err(#AlreadyVoted);

        let vote : Vote = {
          proposalId;
          voter  = msg.caller;
          choice;
          castAt = Time.now();
        };
        Map.add(votes, Text.compare, key, vote);

        let updated = switch (choice) {
          case (#Yes)     { { p with yesVotes     = p.yesVotes     + 1 } };
          case (#No)      { { p with noVotes      = p.noVotes      + 1 } };
          case (#Abstain) { { p with abstainVotes = p.abstainVotes + 1 } };
        };
        Map.add(proposals, Text.compare, proposalId, updated);
        #ok(vote)
      };
    }
  };

  public shared(msg) func finalizeProposal(id : Text) : async Result.Result<Proposal, Error> {
    switch (Map.get(proposals, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?p)  {
        if (p.status != #Open) return #err(#NotOpen);
        let total = p.yesVotes + p.noVotes + p.abstainVotes;
        let passed = total > 0 and (p.yesVotes * 100 / total >= p.quorumPercent);
        let updated = { p with status = if (passed) #Passed else #Failed };
        Map.add(proposals, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getProposal(id : Text) : async ?Proposal {
    Map.get(proposals, Text.compare, id)
  };

  public query func getOpenProposals() : async [Proposal] {
    Array.filter<Proposal>(Map.toValueArray(proposals), func(p) { p.status == #Open })
  };

  public query func getAllProposals() : async [Proposal] {
    Map.toValueArray(proposals)
  };

  public query func getMyVote(proposalId : Text, voter : Principal) : async ?Vote {
    Map.get(votes, Text.compare, voteKey(proposalId, voter))
  };
};

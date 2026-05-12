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
    #ElectionNotOver;
    #AlreadyNominated;
  };

  // ─── Election Types ────────────────────────────────────────────────────────

  public type ElectionType   = { #BoardSeat; #ByLawAmendment; #SpecialAssessment };
  public type ElectionStatus = { #Active; #Certified; #Cancelled };

  public type Election = {
    id:                 Text;
    title:              Text;
    electionType:       ElectionType;
    nominationDeadline: Time.Time;
    votingOpen:         Time.Time;
    votingClose:        Time.Time;
    quorumPercent:      Nat;         // 10 = FL §720.306 default
    seats:              ?Nat;        // #BoardSeat only
    totalEligibleUnits: Nat;
    status:             ElectionStatus;
    createdBy:          Principal;
    createdAt:          Time.Time;
  };

  public type Nomination = {
    id:          Text;
    electionId:  Text;
    candidate:   Principal;
    nominatedBy: Principal;
    bio:         Text;
    photoHash:   ?Text;
    createdAt:   Time.Time;
  };

  public type BallotChoice = {
    #Candidates : [Principal];
    #YeaNay     : Bool;
  };

  public type Ballot = {
    id:         Text;
    electionId: Text;
    voter:      Principal;
    choice:     BallotChoice;
    castAt:     Time.Time;
  };

  public type CandidateTally = {
    candidate : Principal;
    votes     : Nat;
  };

  public type ElectionResult = {
    electionId    : Text;
    yeaVotes      : Nat;
    nayVotes      : Nat;
    tallies       : [CandidateTally];
    totalBallots  : Nat;
    quorumReached : Bool;
    passed        : Bool;
    certifiedAt   : Time.Time;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var proposalCounter : Nat = 0;
  private var pollCounter     : Nat = 0;
  private var membersCanisterId : Text = "";
  private let proposals  = Map.empty<Text, Proposal>();
  private let votes      = Map.empty<Text, Vote>();      // key: proposalId # "_" # principalText
  private let polls      = Map.empty<Text, Poll>();
  private let pollVotes  = Map.empty<Text, Nat>();       // key: pollId # "_" # principalText, value: optionIdx

  // ─── Election State ────────────────────────────────────────────────────────
  private var electionCounter   : Nat = 0;
  private var nominationCounter : Nat = 0;
  private var ballotCounter     : Nat = 0;
  private let elections   = Map.empty<Text, Election>();
  private let nominations = Map.empty<Text, Nomination>();
  private let nominees    = Map.empty<Text, Text>();     // electionId_NOM_principal → nominationId
  private let ballots     = Map.empty<Text, Ballot>();   // electionId_VOTE_principal → ballot
  private let elecResults = Map.empty<Text, ElectionResult>();

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

  private func nextElectionId() : Text {
    electionCounter += 1;
    "ELEC_" # Nat.toText(electionCounter)
  };

  private func nextNominationId() : Text {
    nominationCounter += 1;
    "NOM_" # Nat.toText(nominationCounter)
  };

  private func nextBallotId() : Text {
    ballotCounter += 1;
    "BALLOT_" # Nat.toText(ballotCounter)
  };

  private func nomineeKey(electionId : Text, candidate : Principal) : Text {
    electionId # "_NOM_" # Principal.toText(candidate)
  };

  private func ballotKey(electionId : Text, voter : Principal) : Text {
    electionId # "_VOTE_" # Principal.toText(voter)
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

  // ─── Elections ────────────────────────────────────────────────────────────

  public shared(msg) func createElection(
    title               : Text,
    electionType        : ElectionType,
    nominationDeadline  : Time.Time,
    votingOpen          : Time.Time,
    votingClose         : Time.Time,
    quorumPercent       : Nat,
    totalEligibleUnits  : Nat,
    seats               : ?Nat
  ) : async Result.Result<Election, Error> {
    if (Principal.isAnonymous(msg.caller))  return #err(#NotAuthorized);
    if (Text.size(title) == 0)              return #err(#InvalidInput("title required"));
    if (quorumPercent > 100)                return #err(#InvalidInput("quorumPercent must be 0-100"));
    if (nominationDeadline >= votingOpen)   return #err(#InvalidInput("nominationDeadline must precede votingOpen"));
    if (votingOpen >= votingClose)          return #err(#InvalidInput("votingOpen must precede votingClose"));
    let election : Election = {
      id                 = nextElectionId();
      title;
      electionType;
      nominationDeadline;
      votingOpen;
      votingClose;
      quorumPercent;
      seats;
      totalEligibleUnits;
      status             = #Active;
      createdBy          = msg.caller;
      createdAt          = Time.now();
    };
    Map.add(elections, Text.compare, election.id, election);
    #ok(election)
  };

  public shared(msg) func nominateSelf(
    electionId : Text,
    bio        : Text,
    photoHash  : ?Text
  ) : async Result.Result<Nomination, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(elections, Text.compare, electionId)) {
      case null { #err(#NotFound) };
      case (?election) {
        if (election.status != #Active)               return #err(#InvalidInput("election is not active"));
        if (Time.now() > election.nominationDeadline) return #err(#InvalidInput("nomination window has closed"));
        let nKey = nomineeKey(electionId, msg.caller);
        if (Map.get(nominees, Text.compare, nKey) != null) return #err(#AlreadyNominated);
        let nomination : Nomination = {
          id          = nextNominationId();
          electionId;
          candidate   = msg.caller;
          nominatedBy = msg.caller;
          bio;
          photoHash;
          createdAt   = Time.now();
        };
        Map.add(nominations, Text.compare, nomination.id, nomination);
        Map.add(nominees, Text.compare, nKey, nomination.id);
        #ok(nomination)
      };
    }
  };

  public shared(msg) func nominateOwner(
    electionId : Text,
    candidate  : Principal,
    bio        : Text
  ) : async Result.Result<Nomination, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(elections, Text.compare, electionId)) {
      case null { #err(#NotFound) };
      case (?election) {
        if (election.status != #Active)               return #err(#InvalidInput("election is not active"));
        if (Time.now() > election.nominationDeadline) return #err(#InvalidInput("nomination window has closed"));
        let nKey = nomineeKey(electionId, candidate);
        if (Map.get(nominees, Text.compare, nKey) != null) return #err(#AlreadyNominated);
        let nomination : Nomination = {
          id          = nextNominationId();
          electionId;
          candidate;
          nominatedBy = msg.caller;
          bio;
          photoHash   = null;
          createdAt   = Time.now();
        };
        Map.add(nominations, Text.compare, nomination.id, nomination);
        Map.add(nominees, Text.compare, nKey, nomination.id);
        #ok(nomination)
      };
    }
  };

  public shared(msg) func castBallot(
    electionId : Text,
    choice     : BallotChoice
  ) : async Result.Result<Ballot, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(elections, Text.compare, electionId)) {
      case null { #err(#NotFound) };
      case (?election) {
        if (election.status != #Active)        return #err(#InvalidInput("election is not active"));
        if (Time.now() < election.votingOpen)  return #err(#InvalidInput("voting has not opened yet"));
        if (Time.now() > election.votingClose) return #err(#InvalidInput("voting window has closed"));
        let bKey = ballotKey(electionId, msg.caller);
        if (Map.get(ballots, Text.compare, bKey) != null) return #err(#AlreadyVoted);
        switch (election.electionType, choice) {
          case (#BoardSeat, #YeaNay(_))             { return #err(#InvalidInput("board seat elections require a candidates ballot")) };
          case (#ByLawAmendment, #Candidates(_))    { return #err(#InvalidInput("bylaw elections require a yea/nay ballot")) };
          case (#SpecialAssessment, #Candidates(_)) { return #err(#InvalidInput("special assessment elections require a yea/nay ballot")) };
          case _ {};
        };
        switch (choice) {
          case (#Candidates(candidates)) {
            switch (election.seats) {
              case (?s) {
                if (candidates.size() > s) return #err(#InvalidInput("voted for more candidates than seats"));
              };
              case null {};
            };
            for (candidate in candidates.vals()) {
              let nKey = nomineeKey(electionId, candidate);
              if (Map.get(nominees, Text.compare, nKey) == null) {
                return #err(#InvalidInput("candidate is not nominated"));
              };
            };
          };
          case (#YeaNay(_)) {};
        };
        let ballot : Ballot = {
          id        = nextBallotId();
          electionId;
          voter     = msg.caller;
          choice;
          castAt    = Time.now();
        };
        Map.add(ballots, Text.compare, bKey, ballot);
        #ok(ballot)
      };
    }
  };

  public shared(msg) func certifyResults(electionId : Text) : async Result.Result<ElectionResult, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(elections, Text.compare, electionId)) {
      case null { #err(#NotFound) };
      case (?election) {
        if (election.status != #Active)         return #err(#InvalidInput("election is not active"));
        if (Time.now() <= election.votingClose) return #err(#ElectionNotOver);
        let electionBallots = Array.filter<Ballot>(
          Iter.toArray(Map.values(ballots)),
          func(b) { b.electionId == electionId }
        );
        let totalBallots = electionBallots.size();
        let quorumRequired = election.totalEligibleUnits * election.quorumPercent / 100;
        let quorumReached = totalBallots >= quorumRequired;
        var yeaVotes : Nat = 0;
        var nayVotes : Nat = 0;
        let allNominations = Array.filter<Nomination>(
          Iter.toArray(Map.values(nominations)),
          func(n) { n.electionId == electionId }
        );
        let tallyMap = Map.empty<Text, Nat>();
        for (nom in allNominations.vals()) {
          Map.add(tallyMap, Text.compare, Principal.toText(nom.candidate), 0);
        };
        for (ballot in electionBallots.vals()) {
          switch (ballot.choice) {
            case (#YeaNay(yea)) {
              if (yea) { yeaVotes += 1 } else { nayVotes += 1 };
            };
            case (#Candidates(candidates)) {
              for (candidate in candidates.vals()) {
                let key = Principal.toText(candidate);
                let current = switch (Map.get(tallyMap, Text.compare, key)) {
                  case (?n) { n };
                  case null { 0 };
                };
                Map.add(tallyMap, Text.compare, key, current + 1);
              };
            };
          };
        };
        let rawTallies : [CandidateTally] = Array.map<Nomination, CandidateTally>(
          allNominations, func(n) {
            let key = Principal.toText(n.candidate);
            let votes = switch (Map.get(tallyMap, Text.compare, key)) {
              case (?v) { v };
              case null { 0 };
            };
            { candidate = n.candidate; votes }
          }
        );
        let tallies = Array.sort<CandidateTally>(rawTallies, func(a, b) {
          if (b.votes > a.votes) { #less }
          else if (b.votes < a.votes) { #greater }
          else { #equal }
        });
        let passed = quorumReached and (switch (election.electionType) {
          case (#BoardSeat)         { tallies.size() > 0 };
          case (#ByLawAmendment)    { yeaVotes > nayVotes };
          case (#SpecialAssessment) { yeaVotes > nayVotes };
        });
        let result : ElectionResult = {
          electionId;
          yeaVotes;
          nayVotes;
          tallies;
          totalBallots;
          quorumReached;
          passed;
          certifiedAt = Time.now();
        };
        Map.add(elecResults, Text.compare, electionId, result);
        Map.add(elections, Text.compare, electionId, { election with status = #Certified });
        #ok(result)
      };
    }
  };

  public shared(msg) func cancelElection(electionId : Text) : async Result.Result<Election, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(elections, Text.compare, electionId)) {
      case null { #err(#NotFound) };
      case (?election) {
        if (election.createdBy != msg.caller) return #err(#NotAuthorized);
        if (election.status != #Active)       return #err(#InvalidInput("election is not active"));
        Map.add(elections, Text.compare, electionId, { election with status = #Cancelled });
        #ok({ election with status = #Cancelled })
      };
    }
  };

  // ─── Election Queries ─────────────────────────────────────────────────────

  public query func getElection(id : Text) : async ?Election {
    Map.get(elections, Text.compare, id)
  };

  public query func getAllElections() : async [Election] {
    Iter.toArray(Map.values(elections))
  };

  public query func getActiveElections() : async [Election] {
    Array.filter<Election>(Iter.toArray(Map.values(elections)), func(e) { e.status == #Active })
  };

  public query func getNominations(electionId : Text) : async [Nomination] {
    Array.filter<Nomination>(Iter.toArray(Map.values(nominations)), func(n) { n.electionId == electionId })
  };

  public query func getElectionResult(electionId : Text) : async ?ElectionResult {
    Map.get(elecResults, Text.compare, electionId)
  };

  // Returns null while election is still in voting phase (secret ballot)
  public query func getBallots(electionId : Text) : async ?[Ballot] {
    switch (Map.get(elections, Text.compare, electionId)) {
      case null { null };
      case (?election) {
        if (Time.now() <= election.votingClose) return null;
        ?Array.filter<Ballot>(Iter.toArray(Map.values(ballots)), func(b) { b.electionId == electionId })
      };
    }
  };

  public query func hasVoted(electionId : Text, voter : Principal) : async Bool {
    let bKey = ballotKey(electionId, voter);
    Map.get(ballots, Text.compare, bKey) != null
  };
};

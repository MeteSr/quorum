/**
 * Quorum — Violations Canister
 *
 * Community standards enforcement: parking, noise, landscaping, pet, and
 * other violations reported by residents or board members.
 * Violations are immutable once created — no delete, no edit.
 * Board members can update status; anyone can add a reply.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Violations {

  // ─── Types ────────────────────────────────────────────────────────────────────

  public type ViolationCategory = {
    #Parking;
    #Noise;
    #Landscaping;
    #Pet;
    #Other;
  };

  public type ViolationStatus = {
    #Open;
    #UnderReview;
    #Resolved;
  };

  public type Reply = {
    author:    Principal;
    text:      Text;
    createdAt: Time.Time;
  };

  public type Violation = {
    id:          Text;
    unitId:      Text;
    category:    ViolationCategory;
    description: Text;
    photoHash:   ?Text;
    status:      ViolationStatus;
    replies:     [Reply];
    submittedBy: Principal;
    createdAt:   Time.Time;
    updatedAt:   Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter : Nat = 0;
  private let violations = Map.empty<Text, Violation>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "VIO_" # Nat.toText(counter)
  };

  // ─── Update calls ─────────────────────────────────────────────────────────────

  public shared(msg) func createViolation(
    unitId:      Text,
    category:    ViolationCategory,
    description: Text,
    photoHash:   ?Text
  ) : async Result.Result<Violation, Error> {
    if (Text.size(unitId)      == 0) return #err(#InvalidInput("unitId required"));
    if (Text.size(description) == 0) return #err(#InvalidInput("description required"));
    let violation : Violation = {
      id          = nextId();
      unitId;
      category;
      description;
      photoHash;
      status      = #Open;
      replies     = [];
      submittedBy = msg.caller;
      createdAt   = Time.now();
      updatedAt   = Time.now();
    };
    Map.add(violations, Text.compare, violation.id, violation);
    #ok(violation)
  };

  public shared(msg) func addReply(
    violationId: Text,
    text:        Text
  ) : async Result.Result<Violation, Error> {
    switch (Map.get(violations, Text.compare, violationId)) {
      case null { #err(#NotFound) };
      case (?violation) {
        if (Text.size(text) == 0) return #err(#InvalidInput("reply text required"));
        let reply : Reply = {
          author    = msg.caller;
          text;
          createdAt = Time.now();
        };
        let newReplies = Array.tabulate<Reply>(violation.replies.size() + 1, func(idx) {
          if (idx < violation.replies.size()) violation.replies[idx] else reply
        });
        let updated = { violation with replies = newReplies; updatedAt = Time.now() };
        Map.add(violations, Text.compare, violationId, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func updateStatus(
    violationId: Text,
    status:      ViolationStatus
  ) : async Result.Result<Violation, Error> {
    switch (Map.get(violations, Text.compare, violationId)) {
      case null { #err(#NotFound) };
      case (?violation) {
        if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
        let updated = { violation with status; updatedAt = Time.now() };
        Map.add(violations, Text.compare, violationId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────────

  public query func getViolation(violationId : Text) : async ?Violation {
    Map.get(violations, Text.compare, violationId)
  };

  public shared query(msg) func getMyViolations() : async [Violation] {
    Array.filter<Violation>(Iter.toArray(Map.values(violations)), func(violation) {
      violation.submittedBy == msg.caller
    })
  };

  public query func getViolationsForUnit(unitId : Text) : async [Violation] {
    Array.filter<Violation>(Iter.toArray(Map.values(violations)), func(violation) {
      violation.unitId == unitId
    })
  };

  public query func getAllViolations() : async [Violation] {
    Iter.toArray(Map.values(violations))
  };
};

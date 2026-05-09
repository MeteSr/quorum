/**
 * Quorum — Treasury Canister
 *
 * HOA dues, special assessments, and payment records.
 * Tracks outstanding balances per unit; board can post assessments
 * and mark payments received.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Treasury {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type AssessmentType = {
    #MonthlyDues;
    #SpecialAssessment;
    #Fine;
    #Amenity;
  };

  public type PaymentStatus = { #Outstanding; #Paid; #Waived; #Disputed };

  public type Assessment = {
    id:          Text;
    unitId:      Text;
    amountCents: Nat;
    kind:        AssessmentType;
    description: Text;
    dueDate:     Time.Time;
    status:      PaymentStatus;
    paidAt:      ?Time.Time;
    createdAt:   Time.Time;
    createdBy:   Principal;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter : Nat = 0;
  private var membersCanisterId : Text = "";
  private let assessments = Map.empty<Text, Assessment>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "ASSESS_" # Nat.toText(counter)
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────────

  public shared func setMembersCanisterId(id : Text) : async () {
    membersCanisterId := id;
  };

  // ─── Board Actions ────────────────────────────────────────────────────────────

  public shared(msg) func postAssessment(
    unitId:      Text,
    amountCents: Nat,
    kind:        AssessmentType,
    description: Text,
    dueDate:     Time.Time
  ) : async Result.Result<Assessment, Error> {
    if (amountCents == 0) return #err(#InvalidInput("amountCents must be > 0"));
    let a : Assessment = {
      id          = nextId();
      unitId;
      amountCents;
      kind;
      description;
      dueDate;
      status      = #Outstanding;
      paidAt      = null;
      createdAt   = Time.now();
      createdBy   = msg.caller;
    };
    Map.add(assessments, Text.compare, a.id, a);
    #ok(a)
  };

  public shared(msg) func markPaid(id : Text) : async Result.Result<Assessment, Error> {
    switch (Map.get(assessments, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?a)  {
        let updated = { a with status = #Paid; paidAt = ?Time.now() };
        Map.add(assessments, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func waiveAssessment(id : Text) : async Result.Result<Assessment, Error> {
    switch (Map.get(assessments, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?a)  {
        let updated = { a with status = #Waived };
        Map.add(assessments, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getAssessment(id : Text) : async ?Assessment {
    Map.get(assessments, Text.compare, id)
  };

  public query func getAssessmentsForUnit(unitId : Text) : async [Assessment] {
    Array.filter<Assessment>(Iter.toArray(Map.values(assessments)), func(a) { a.unitId == unitId })
  };

  public query func getOutstandingAssessments() : async [Assessment] {
    Array.filter<Assessment>(Iter.toArray(Map.values(assessments)), func(a) { a.status == #Outstanding })
  };

  public query func getTotalOutstandingCents() : async Nat {
    let outstanding = Array.filter<Assessment>(Iter.toArray(Map.values(assessments)), func(a) { a.status == #Outstanding });
    Array.foldLeft<Assessment, Nat>(outstanding, 0, func(acc, a) { acc + a.amountCents })
  };
};

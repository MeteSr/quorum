/**
 * Quorum — ARC (Architectural Review Committee) Canister
 *
 * Manages resident submissions for exterior modifications — fences, additions,
 * roofs, landscaping, etc. — and the board approval workflow.
 * Submissions are append-only; only status and review notes may be updated.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Arc {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type RequestType = {
    #Fence;
    #Addition;
    #Roof;
    #Landscaping;
    #Deck;
    #Siding;
    #Window;
    #Other;
  };

  public type RequestStatus = {
    #Pending;
    #UnderReview;
    #Approved;
    #Rejected;
  };

  public type ArcRequest = {
    id:          Text;
    unitId:      Text;
    requestType: RequestType;
    description: Text;
    photoHash:   ?Text;
    status:      RequestStatus;
    reviewNotes: ?Text;
    submittedBy: Principal;
    reviewedBy:  ?Principal;
    createdAt:   Time.Time;
    updatedAt:   Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var counter : Nat = 0;
  private let requests = Map.empty<Text, ArcRequest>();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "ARC_" # Nat.toText(counter)
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared(msg) func submitRequest(
    unitId:      Text,
    requestType: RequestType,
    description: Text,
    photoHash:   ?Text
  ) : async Result.Result<ArcRequest, Error> {
    if (Text.size(unitId)      == 0) return #err(#InvalidInput("unitId required"));
    if (Text.size(description) == 0) return #err(#InvalidInput("description required"));
    let request : ArcRequest = {
      id          = nextId();
      unitId;
      requestType;
      description;
      photoHash;
      status      = #Pending;
      reviewNotes = null;
      submittedBy = msg.caller;
      reviewedBy  = null;
      createdAt   = Time.now();
      updatedAt   = Time.now();
    };
    Map.add(requests, Text.compare, request.id, request);
    #ok(request)
  };

  public shared(msg) func updateStatus(
    requestId:   Text,
    status:      RequestStatus,
    reviewNotes: ?Text
  ) : async Result.Result<ArcRequest, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(requests, Text.compare, requestId)) {
      case null { #err(#NotFound) };
      case (?request) {
        let updated = { request with status; reviewNotes; reviewedBy = ?msg.caller; updatedAt = Time.now() };
        Map.add(requests, Text.compare, requestId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getRequest(requestId : Text) : async ?ArcRequest {
    Map.get(requests, Text.compare, requestId)
  };

  public query func getRequestsForUnit(unitId : Text) : async [ArcRequest] {
    Array.filter<ArcRequest>(
      Iter.toArray(Map.values(requests)),
      func(request) { request.unitId == unitId }
    )
  };

  public shared query(msg) func getMyRequests() : async [ArcRequest] {
    Array.filter<ArcRequest>(
      Iter.toArray(Map.values(requests)),
      func(request) { request.submittedBy == msg.caller }
    )
  };

  public query func getAllRequests() : async [ArcRequest] {
    Iter.toArray(Map.values(requests))
  };
}

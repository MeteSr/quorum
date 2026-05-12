/**
 * Quorum — Maintenance Canister
 *
 * Residents submit repair requests; board/managers assign and track them
 * to resolution. Full audit trail on every status change.
 * Requests open > 7 days surface an SLA warning flag.
 *
 * Approval workflow (#16): assignments with an estimated cost above the
 * configured threshold are held in #PendingApproval until a manager with
 * sufficient authority approves or rejects them.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Maintenance {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type RequestCategory = {
    #Plumbing;
    #Electrical;
    #HVAC;
    #Structural;
    #Landscaping;
    #Appliance;
    #Other;
  };

  public type RequestStatus = {
    #Open;
    #PendingApproval;   // awaiting manager sign-off (#16)
    #Assigned;
    #InProgress;
    #Resolved;
    #Closed;
  };

  // Approval state for assignments that exceed the expenditure threshold (#16).
  public type ApprovalState = {
    #NotRequired;
    #Pending;
    #Approved : { by : Principal; at : Time.Time };
    #Rejected : { by : Principal; at : Time.Time; reason : Text };
  };

  public type AuditEntry = {
    status:    RequestStatus;
    note:      Text;
    updatedBy: Principal;
    updatedAt: Time.Time;
  };

  public type MaintenanceRequest = {
    id:               Text;
    unitId:           Text;
    category:         RequestCategory;
    description:      Text;
    photoHashes:      [Text];
    submittedBy:      Principal;
    assignedVendorId: ?Text;
    scheduledDate:    ?Time.Time;
    estimatedCents:   ?Nat;       // optional cost estimate attached at assignment (#16)
    status:           RequestStatus;
    approvalState:    ApprovalState; // (#16)
    slaWarning:       Bool;
    history:          [AuditEntry];
    createdAt:        Time.Time;
    updatedAt:        Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter                 : Nat     = 0;
  private var membersCanisterId       : Text     = "";
  private var approvalThresholdCents  : ?Nat     = null;  // null = no threshold (#16)
  private let requests = Map.empty<Text, MaintenanceRequest>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private let SLA_NANOS : Int = 7 * 24 * 3600 * 1_000_000_000;

  private func nextId() : Text {
    counter += 1;
    "MAINT_" # Nat.toText(counter)
  };

  private func computeSla(r : MaintenanceRequest) : MaintenanceRequest {
    let open = r.status == #Open or r.status == #Assigned or r.status == #PendingApproval;
    let late = open and (Time.now() - r.createdAt) > SLA_NANOS;
    { r with slaWarning = late }
  };

  // Check whether the caller can approve up to amountCents via members canister.
  private func checkApprovalAuthority(caller : Principal, amountCents : Nat) : async Bool {
    if (membersCanisterId == "") return false;
    type Members = actor { canApprove : query (Principal, Nat) -> async Bool };
    let m : Members = actor(membersCanisterId);
    try { await m.canApprove(caller, amountCents) } catch (_) { false }
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────────

  public shared func setMembersCanisterId(id : Text) : async () {
    membersCanisterId := id;
  };

  // Board-only: set the expenditure threshold above which approval is required.
  // Pass null to disable the threshold entirely.
  public shared func setApprovalThreshold(cents : ?Nat) : async () {
    approvalThresholdCents := cents;
  };

  public query func getApprovalThreshold() : async ?Nat { approvalThresholdCents };

  // ─── Update Calls ─────────────────────────────────────────────────────────────

  public shared(msg) func submitRequest(
    unitId:      Text,
    category:    RequestCategory,
    description: Text,
    photoHashes: [Text]
  ) : async Result.Result<MaintenanceRequest, Error> {
    if (Text.size(unitId) == 0)      return #err(#InvalidInput("unitId required"));
    if (Text.size(description) == 0) return #err(#InvalidInput("description required"));
    let now = Time.now();
    let r : MaintenanceRequest = {
      id               = nextId();
      unitId;
      category;
      description;
      photoHashes;
      submittedBy      = msg.caller;
      assignedVendorId = null;
      scheduledDate    = null;
      estimatedCents   = null;
      status           = #Open;
      approvalState    = #NotRequired;
      slaWarning       = false;
      history          = [];
      createdAt        = now;
      updatedAt        = now;
    };
    Map.add(requests, Text.compare, r.id, r);
    #ok(r)
  };

  public shared(msg) func assignRequest(
    requestId:      Text,
    vendorId:       Text,
    scheduledDate:  ?Time.Time,
    estimatedCents: ?Nat
  ) : async Result.Result<MaintenanceRequest, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null  { #err(#NotFound) };
      case (?r)  {
        // Determine whether approval is required.
        let needsApproval : Bool = switch (approvalThresholdCents, estimatedCents) {
          case (?threshold, ?est) { est > threshold };
          case _                  { false };
        };

        let (newStatus, newApproval) : (RequestStatus, ApprovalState) =
          if (needsApproval) (#PendingApproval, #Pending)
          else               (#Assigned,        #NotRequired);

        let entry : AuditEntry = {
          status    = newStatus;
          note      = if (needsApproval)
                        "Assignment pending approval — estimated " #
                        (switch estimatedCents { case (?c) Nat.toText(c); case null "?" }) # " cents"
                      else "Assigned to vendor: " # vendorId;
          updatedBy = msg.caller;
          updatedAt = Time.now();
        };
        let updated : MaintenanceRequest = {
          r with
          assignedVendorId = ?vendorId;
          scheduledDate;
          estimatedCents;
          status        = newStatus;
          approvalState = newApproval;
          history       = Array.tabulate<AuditEntry>(r.history.size() + 1, func(i) {
            if (i < r.history.size()) r.history[i] else entry
          });
          updatedAt = Time.now();
        };
        Map.add(requests, Text.compare, requestId, updated);
        #ok(computeSla(updated))
      };
    }
  };

  // Manager+: approve a pending assignment.
  public shared(msg) func approveAssignment(requestId : Text) : async Result.Result<MaintenanceRequest, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null  { #err(#NotFound) };
      case (?r)  {
        switch (r.approvalState) {
          case (#Pending) {};
          case _ { return #err(#InvalidInput("Request is not pending approval")) };
        };
        // Check authority with members canister.
        let amount = switch (r.estimatedCents) { case (?c) c; case null 0 };
        let authorized = await checkApprovalAuthority(msg.caller, amount);
        if (not authorized) return #err(#NotAuthorized);

        let entry : AuditEntry = {
          status    = #Assigned;
          note      = "Approved by manager";
          updatedBy = msg.caller;
          updatedAt = Time.now();
        };
        let updated : MaintenanceRequest = {
          r with
          status        = #Assigned;
          approvalState = #Approved({ by = msg.caller; at = Time.now() });
          history       = Array.tabulate<AuditEntry>(r.history.size() + 1, func(i) {
            if (i < r.history.size()) r.history[i] else entry
          });
          updatedAt = Time.now();
        };
        Map.add(requests, Text.compare, requestId, updated);
        #ok(computeSla(updated))
      };
    }
  };

  // Manager+: reject a pending assignment.
  public shared(msg) func rejectAssignment(
    requestId : Text,
    reason    : Text
  ) : async Result.Result<MaintenanceRequest, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null  { #err(#NotFound) };
      case (?r)  {
        switch (r.approvalState) {
          case (#Pending) {};
          case _ { return #err(#InvalidInput("Request is not pending approval")) };
        };
        let amount = switch (r.estimatedCents) { case (?c) c; case null 0 };
        let authorized = await checkApprovalAuthority(msg.caller, amount);
        if (not authorized) return #err(#NotAuthorized);

        let entry : AuditEntry = {
          status    = #Open;
          note      = "Assignment rejected: " # reason;
          updatedBy = msg.caller;
          updatedAt = Time.now();
        };
        let updated : MaintenanceRequest = {
          r with
          status        = #Open;
          approvalState = #Rejected({ by = msg.caller; at = Time.now(); reason });
          history       = Array.tabulate<AuditEntry>(r.history.size() + 1, func(i) {
            if (i < r.history.size()) r.history[i] else entry
          });
          updatedAt = Time.now();
        };
        Map.add(requests, Text.compare, requestId, updated);
        #ok(computeSla(updated))
      };
    }
  };

  public shared(msg) func updateStatus(
    requestId : Text,
    status    : RequestStatus,
    note      : Text
  ) : async Result.Result<MaintenanceRequest, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null  { #err(#NotFound) };
      case (?r)  {
        let entry : AuditEntry = {
          status;
          note;
          updatedBy = msg.caller;
          updatedAt = Time.now();
        };
        let updated : MaintenanceRequest = {
          r with
          status;
          history   = Array.tabulate<AuditEntry>(r.history.size() + 1, func(i) {
            if (i < r.history.size()) r.history[i] else entry
          });
          updatedAt = Time.now();
        };
        Map.add(requests, Text.compare, requestId, updated);
        #ok(computeSla(updated))
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getRequest(id : Text) : async ?MaintenanceRequest {
    switch (Map.get(requests, Text.compare, id)) {
      case null  { null };
      case (?r)  { ?computeSla(r) };
    }
  };

  public query(msg) func getMyRequests() : async [MaintenanceRequest] {
    let all = Iter.toArray(Map.values(requests));
    let mine = Array.filter<MaintenanceRequest>(all, func(r) { r.submittedBy == msg.caller });
    Array.map<MaintenanceRequest, MaintenanceRequest>(mine, computeSla)
  };

  public query func getRequestsForUnit(unitId : Text) : async [MaintenanceRequest] {
    let all = Iter.toArray(Map.values(requests));
    let unit = Array.filter<MaintenanceRequest>(all, func(r) { r.unitId == unitId });
    Array.map<MaintenanceRequest, MaintenanceRequest>(unit, computeSla)
  };

  public query func getAllRequests() : async [MaintenanceRequest] {
    Array.map<MaintenanceRequest, MaintenanceRequest>(
      Iter.toArray(Map.values(requests)),
      computeSla
    )
  };

  public query func getOpenRequests() : async [MaintenanceRequest] {
    let open = Array.filter<MaintenanceRequest>(
      Iter.toArray(Map.values(requests)),
      func(r) { r.status == #Open or r.status == #PendingApproval or
                r.status == #Assigned or r.status == #InProgress }
    );
    Array.map<MaintenanceRequest, MaintenanceRequest>(open, computeSla)
  };

  // Board/manager: get all requests currently awaiting approval.
  public query func getPendingApproval() : async [MaintenanceRequest] {
    let pending = Array.filter<MaintenanceRequest>(
      Iter.toArray(Map.values(requests)),
      func(r) { r.status == #PendingApproval }
    );
    Array.map<MaintenanceRequest, MaintenanceRequest>(pending, computeSla)
  };
};

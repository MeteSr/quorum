/**
 * Quorum — Maintenance Canister
 *
 * Residents submit repair requests; board/managers assign and track them
 * to resolution. Full audit trail on every status change.
 * Requests open > 7 days surface an SLA warning flag.
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
    #Assigned;
    #InProgress;
    #Resolved;
    #Closed;
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
    status:           RequestStatus;
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

  private var counter          : Nat  = 0;
  private var membersCanisterId: Text = "";
  private let requests = Map.empty<Text, MaintenanceRequest>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private let SLA_NANOS : Int = 7 * 24 * 3600 * 1_000_000_000;

  private func nextId() : Text {
    counter += 1;
    "MAINT_" # Nat.toText(counter)
  };

  private func computeSla(r : MaintenanceRequest) : MaintenanceRequest {
    let open = r.status == #Open or r.status == #Assigned;
    let late = open and (Time.now() - r.createdAt) > SLA_NANOS;
    { r with slaWarning = late }
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────────

  public shared func setMembersCanisterId(id : Text) : async () {
    membersCanisterId := id;
  };

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
      status           = #Open;
      slaWarning       = false;
      history          = [];
      createdAt        = now;
      updatedAt        = now;
    };
    Map.add(requests, Text.compare, r.id, r);
    #ok(r)
  };

  public shared(msg) func assignRequest(
    requestId:     Text,
    vendorId:      Text,
    scheduledDate: ?Time.Time
  ) : async Result.Result<MaintenanceRequest, Error> {
    switch (Map.get(requests, Text.compare, requestId)) {
      case null  { #err(#NotFound) };
      case (?r)  {
        let entry : AuditEntry = {
          status    = #Assigned;
          note      = "Assigned to vendor: " # vendorId;
          updatedBy = msg.caller;
          updatedAt = Time.now();
        };
        let updated : MaintenanceRequest = {
          r with
          assignedVendorId = ?vendorId;
          scheduledDate;
          status    = #Assigned;
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
      func(r) { r.status == #Open or r.status == #Assigned or r.status == #InProgress }
    );
    Array.map<MaintenanceRequest, MaintenanceRequest>(open, computeSla)
  };
};

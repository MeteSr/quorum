/**
 * Quorum — Announcements Canister
 *
 * Community-wide notices, event reminders, and maintenance alerts.
 * Board posts announcements; all active members can read them.
 * Announcements auto-expire after their expiresAt timestamp.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Nat64     "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Announcements {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type Priority = { #Normal; #Urgent };

  public type Severity = { #Info; #Warning; #Emergency };

  public type Visibility = { #Public; #Members };

  public type Broadcast = {
    id:       Text;
    title:    Text;
    body:     Text;
    severity: Severity;
    sentBy:   Principal;
    sentAt:   Time.Time;
  };

  public type Announcement = {
    id:          Text;
    title:       Text;
    body:        Text;
    priority:    Priority;
    visibility:  Visibility;  // #Public = visible on community portal; #Members = members only
    postedBy:    Principal;
    postedAt:    Time.Time;
    expiresAt:   ?Time.Time;  // null = never expires
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  public type EmailConfig = {
    resendApiKey: Text;
    fromEmail:    Text;
    fromName:     Text;
  };

  public type EmailSegment = {
    #All;
    #ByRole:  Text;    // "Homeowner", "BoardMember", etc.
    #UnitIds: [Text];
  };

  public type BulkEmailResult = {
    sentCount:   Nat;
    failedCount: Nat;
  };

  // ─── IC HTTP Outcall interface ────────────────────────────────────────────────

  public type HttpHeader    = { name : Text; value : Text };
  public type HttpMethod    = { #get; #head; #post };
  public type HttpResponse  = { status : Nat; headers : [HttpHeader]; body : Blob };
  public type TransformArgs = { response : HttpResponse; context : Blob };

  let ic : actor {
    http_request : shared ({
      url               : Text;
      max_response_bytes : ?Nat64;
      headers           : [HttpHeader];
      body              : ?Blob;
      method            : HttpMethod;
      transform         : ?{
        function : shared query (TransformArgs) -> async HttpResponse;
        context  : Blob;
      };
    }) -> async HttpResponse;
  } = actor "aaaaa-aa";

  public query func transform(args : TransformArgs) : async HttpResponse {
    { status = args.response.status; headers = []; body = args.response.body }
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter           : Nat = 0;
  private var broadcastCounter  : Nat = 0;
  private let announcements = Map.empty<Text, Announcement>();
  private let broadcasts    = Map.empty<Text, Broadcast>();
  private var emailConfig       : ?EmailConfig = null;
  private var membersCanisterId : Text         = "";

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "ANN_" # Nat.toText(counter)
  };

  private func nextBroadcastId() : Text {
    broadcastCounter += 1;
    "BCAST_" # Nat.toText(broadcastCounter)
  };

  // ─── Email wiring ─────────────────────────────────────────────────────────────

  public shared func setEmailConfig(config : EmailConfig) : async () {
    emailConfig := ?config;
  };

  public shared func setMembersCanisterId(id : Text) : async () {
    membersCanisterId := id;
  };

  // ─── Bulk email (#14) ─────────────────────────────────────────────────────────

  public shared(msg) func sendBulkEmail(
    subject  : Text,
    body     : Text,
    segment  : EmailSegment
  ) : async Result.Result<BulkEmailResult, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    let cfg = switch (emailConfig) {
      case null  { return #err(#InvalidInput("Email not configured")) };
      case (?c)  { c };
    };
    if (membersCanisterId == "") return #err(#InvalidInput("Members canister not configured"));

    type RemoteMember = {
      email:       Text;
      unitId:      Text;
      isActive:    Bool;
      role:        { #Homeowner; #BoardMember; #BoardPresident; #Treasurer; #Secretary; #PropertyManager };
      principal:   Principal;
      displayName: Text;
      joinedAt:    Int;
    };
    let membersActor : actor { getActiveMembers : shared query () -> async [RemoteMember] } = actor(membersCanisterId);
    let allActive = try { await membersActor.getActiveMembers() }
      catch (_) { return #err(#InvalidInput("Members canister unreachable")) };

    let includesUnit = func(ids : [Text], uid : Text) : Bool {
      var found = false;
      for (i in ids.vals()) { if (i == uid) found := true };
      found
    };
    let roleLabel = func(r : { #Homeowner; #BoardMember; #BoardPresident; #Treasurer; #Secretary; #PropertyManager }) : Text {
      switch r {
        case (#Homeowner)       "Homeowner";
        case (#BoardMember)     "BoardMember";
        case (#BoardPresident)  "BoardPresident";
        case (#Treasurer)       "Treasurer";
        case (#Secretary)       "Secretary";
        case (#PropertyManager) "PropertyManager";
      }
    };

    var sent   = 0;
    var failed = 0;
    for (m in allActive.vals()) {
      let shouldSend = switch (segment) {
        case (#All)          { true };
        case (#ByRole(role)) { roleLabel(m.role) == role };
        case (#UnitIds(ids)) { includesUnit(ids, m.unitId) };
      };
      if (shouldSend and m.email != "") {
        let json = "{\"from\":\"" # cfg.fromName # " <" # cfg.fromEmail # ">\",\"to\":[\"" # m.email # "\"],\"subject\":\"" # subject # "\",\"html\":\"<p>" # body # "</p>\"}";
        try {
          ignore await (with cycles = 3_000_000_000) ic.http_request({
            url               = "https://api.resend.com/emails";
            max_response_bytes = ?Nat64.fromNat(4_096);
            headers           = [
              { name = "authorization"; value = "Bearer " # cfg.resendApiKey },
              { name = "content-type";  value = "application/json" },
            ];
            body              = ?Text.encodeUtf8(json);
            method            = #post;
            transform         = ?{ function = transform; context = Blob.fromArray([]) };
          });
          sent += 1;
        } catch (_) { failed += 1 };
      };
    };
    #ok({ sentCount = sent; failedCount = failed })
  };

  // ─── Post / Delete ────────────────────────────────────────────────────────────

  public shared(msg) func post(
    title:      Text,
    body:       Text,
    priority:   Priority,
    visibility: Visibility,
    expiresAt:  ?Time.Time
  ) : async Result.Result<Announcement, Error> {
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    if (Text.size(body)  == 0) return #err(#InvalidInput("body required"));
    let ann : Announcement = {
      id         = nextId();
      title;
      body;
      priority;
      visibility;
      postedBy   = msg.caller;
      postedAt   = Time.now();
      expiresAt;
    };
    Map.add(announcements, Text.compare, ann.id, ann);
    #ok(ann)
  };

  public shared(msg) func delete(id : Text) : async Result.Result<(), Error> {
    switch (Map.get(announcements, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?a)  {
        if (a.postedBy != msg.caller) return #err(#NotAuthorized);
        ignore Map.remove(announcements, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getAnnouncement(id : Text) : async ?Announcement {
    Map.get(announcements, Text.compare, id)
  };

  public query func getActive() : async [Announcement] {
    let now = Time.now();
    Array.filter<Announcement>(Iter.toArray(Map.values(announcements)), func(a) {
      switch (a.expiresAt) {
        case null     { true };
        case (?expiry){ now < expiry };
      }
    })
  };

  public query func getUrgent() : async [Announcement] {
    let now = Time.now();
    Array.filter<Announcement>(Iter.toArray(Map.values(announcements)), func(a) {
      a.priority == #Urgent and (
        switch (a.expiresAt) {
          case null     { true };
          case (?expiry){ now < expiry };
        }
      )
    })
  };

  public query func getAll() : async [Announcement] {
    Iter.toArray(Map.values(announcements))
  };

  // No auth required — used by the public community portal (#24).
  public query func getPublicAnnouncements() : async [Announcement] {
    let now = Time.now();
    Array.filter<Announcement>(Iter.toArray(Map.values(announcements)), func(a) {
      a.visibility == #Public and (
        switch (a.expiresAt) {
          case null     { true };
          case (?expiry){ now < expiry };
        }
      )
    })
  };

  // ─── Emergency Broadcasts ─────────────────────────────────────────────────────

  public shared(msg) func broadcastEmergency(
    title    : Text,
    body     : Text,
    severity : Severity
  ) : async Result.Result<Broadcast, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    if (Text.size(body)  == 0) return #err(#InvalidInput("body required"));
    let b : Broadcast = {
      id       = nextBroadcastId();
      title;
      body;
      severity;
      sentBy   = msg.caller;
      sentAt   = Time.now();
    };
    Map.add(broadcasts, Text.compare, b.id, b);
    #ok(b)
  };

  public query func getBroadcasts() : async [Broadcast] {
    Iter.toArray(Map.values(broadcasts))
  };

  public query func getRecentBroadcasts(days : Nat) : async [Broadcast] {
    let now      = Time.now();
    let windowNs = days * 86_400 * 1_000_000_000;
    let cutoffNs : Int = now - windowNs;
    Array.filter<Broadcast>(Iter.toArray(Map.values(broadcasts)), func(b) {
      b.sentAt > cutoffNs
    })
  };
};

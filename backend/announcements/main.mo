/**
 * Quorum — Announcements Canister
 *
 * Community-wide notices, event reminders, and maintenance alerts.
 * Board posts announcements; all active members can read them.
 * Announcements auto-expire after their expiresAt timestamp.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Announcements {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type Priority = { #Normal; #Urgent };

  public type Severity = { #Info; #Warning; #Emergency };

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
    postedBy:    Principal;
    postedAt:    Time.Time;
    expiresAt:   ?Time.Time;  // null = never expires
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter          : Nat = 0;
  private var broadcastCounter : Nat = 0;
  private let announcements = Map.empty<Text, Announcement>();
  private let broadcasts    = Map.empty<Text, Broadcast>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "ANN_" # Nat.toText(counter)
  };

  private func nextBroadcastId() : Text {
    broadcastCounter += 1;
    "BCAST_" # Nat.toText(broadcastCounter)
  };

  // ─── Post / Delete ────────────────────────────────────────────────────────────

  public shared(msg) func post(
    title:     Text,
    body:      Text,
    priority:  Priority,
    expiresAt: ?Time.Time
  ) : async Result.Result<Announcement, Error> {
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    if (Text.size(body)  == 0) return #err(#InvalidInput("body required"));
    let ann : Announcement = {
      id       = nextId();
      title;
      body;
      priority;
      postedBy = msg.caller;
      postedAt = Time.now();
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
      b.sentAt >= cutoffNs
    })
  };
};

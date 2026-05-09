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

  private var counter : Nat = 0;
  private let announcements = Map.empty<Text, Announcement>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "ANN_" # Nat.toText(counter)
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
};

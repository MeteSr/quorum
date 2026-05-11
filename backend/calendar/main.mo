/**
 * Quorum — Calendar Canister
 *
 * Community calendar: meetings, events, maintenance windows, holidays.
 * Serves an iCal (RFC 5545) feed via http_request for native calendar apps.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Calendar {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type EventType = {
    #Meeting;
    #CommunityEvent;
    #MaintenanceWindow;
    #Holiday;
  };

  public type EventVisibility = { #All; #Board };

  public type CalendarEvent = {
    id:         Text;
    title:      Text;
    startAt:    Time.Time;
    endAt:      Time.Time;
    eventType:  EventType;
    visibility: EventVisibility;
    location:   ?Text;
    createdBy:  Principal;
    createdAt:  Time.Time;
  };

  public type HttpRequest = {
    method:  Text;
    url:     Text;
    headers: [(Text, Text)];
    body:    Blob;
  };

  public type HttpResponse = {
    status_code: Nat16;
    headers:     [(Text, Text)];
    body:        Blob;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var eventCounter        : Nat  = 0;
  private var meetingsCanisterId  : Text = "";
  private let events = Map.empty<Text, CalendarEvent>();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private func nextId() : Text {
    eventCounter += 1;
    "CAL_" # Nat.toText(eventCounter)
  };

  // Format Int nanoseconds as iCal UTC timestamp: YYYYMMDDTHHmmssZ
  // Uses Howard Hinnant's civil_from_days algorithm (works for dates post-1970).
  private func icalTs(ns : Int) : Text {
    let totalSecs : Int = ns / 1_000_000_000;
    let ts : Int = if (totalSecs >= 0) totalSecs else 0;
    let secsInDay : Int = ts % 86400;
    let days      : Int = ts / 86400;
    let h = Int.abs(secsInDay / 3600);
    let mi = Int.abs((secsInDay % 3600) / 60);
    let s = Int.abs(secsInDay % 60);
    // civil_from_days
    let z   : Int = days + 719468;
    let era : Int = (if (z >= 0) z else z - 146096) / 146097;
    let doe : Int = z - era * 146097;
    let yoe : Int = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y0  : Int = yoe + era * 400;
    let doy : Int = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp  : Int = (5 * doy + 2) / 153;
    let d   : Int = doy - (153 * mp + 2) / 5 + 1;
    let mo  : Int = if (mp < 10) mp + 3 else mp - 9;
    let y   : Int = if (mo <= 2) y0 + 1 else y0;
    let pad2 = func(n : Nat) : Text { if (n < 10) "0" # Nat.toText(n) else Nat.toText(n) };
    let pad4 = func(n : Nat) : Text {
      if      (n < 10)   "000" # Nat.toText(n)
      else if (n < 100)  "00"  # Nat.toText(n)
      else if (n < 1000) "0"   # Nat.toText(n)
      else                      Nat.toText(n)
    };
    pad4(Int.abs(y)) # pad2(Int.abs(mo)) # pad2(Int.abs(d))
    # "T" # pad2(h) # pad2(mi) # pad2(s) # "Z"
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────

  public shared func setMeetingsCanisterId(id : Text) : async () {
    meetingsCanisterId := id;
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared(msg) func createEvent(
    title      : Text,
    startAt    : Time.Time,
    endAt      : Time.Time,
    eventType  : EventType,
    visibility : EventVisibility,
    location   : ?Text
  ) : async Result.Result<CalendarEvent, Error> {
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    if (endAt <= startAt)       return #err(#InvalidInput("endAt must be after startAt"));
    let e : CalendarEvent = {
      id = nextId(); title; startAt; endAt; eventType; visibility; location;
      createdBy = msg.caller; createdAt = Time.now();
    };
    Map.add(events, Text.compare, e.id, e);
    #ok(e)
  };

  public shared(msg) func deleteEvent(id : Text) : async Result.Result<(), Error> {
    switch (Map.get(events, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?e) {
        if (e.createdBy != msg.caller) return #err(#NotAuthorized);
        ignore Map.remove(events, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getEvent(id : Text) : async ?CalendarEvent {
    Map.get(events, Text.compare, id)
  };

  public query func listEvents(startAt : Time.Time, endAt : Time.Time) : async [CalendarEvent] {
    Array.filter<CalendarEvent>(
      Iter.toArray(Map.values(events)),
      func(e) { e.startAt >= startAt and e.startAt <= endAt }
    )
  };

  public query func getUpcomingEvents(limit : Nat) : async [CalendarEvent] {
    let now = Time.now();
    let all = Array.filter<CalendarEvent>(
      Iter.toArray(Map.values(events)),
      func(e) { e.startAt >= now }
    );
    if (all.size() <= limit) all
    else Array.tabulate<CalendarEvent>(limit, func(i) { all[i] })
  };

  // ─── iCal HTTP feed ───────────────────────────────────────────────────────

  public query func http_request(req : HttpRequest) : async HttpResponse {
    ignore req;
    var ical : Text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n";
    ical #= "PRODID:-//Quorum//HOA Calendar//EN\r\n";
    ical #= "CALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
    for (e in Iter.fromArray(Iter.toArray(Map.values(events)))) {
      let typeLabel = switch (e.eventType) {
        case (#Meeting)           "Meeting";
        case (#CommunityEvent)    "Community Event";
        case (#MaintenanceWindow) "Maintenance Window";
        case (#Holiday)           "Holiday";
      };
      ical #= "BEGIN:VEVENT\r\n";
      ical #= "UID:" # e.id # "@quorum\r\n";
      ical #= "DTSTART:" # icalTs(e.startAt) # "\r\n";
      ical #= "DTEND:"   # icalTs(e.endAt)   # "\r\n";
      ical #= "SUMMARY:" # e.title # "\r\n";
      ical #= "CATEGORIES:" # typeLabel # "\r\n";
      switch (e.location) {
        case (?loc) { ical #= "LOCATION:" # loc # "\r\n" };
        case null   {};
      };
      ical #= "END:VEVENT\r\n";
    };
    ical #= "END:VCALENDAR";
    {
      status_code = 200;
      headers     = [
        ("Content-Type",        "text/calendar; charset=utf-8"),
        ("Content-Disposition", "attachment; filename=\"community.ics\""),
      ];
      body = Text.encodeUtf8(ical);
    }
  };
}

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
    let hour   = Int.abs(secsInDay / 3600);
    let minute = Int.abs((secsInDay % 3600) / 60);
    let second = Int.abs(secsInDay % 60);
    // civil_from_days
    let zDays      : Int = days + 719468;
    let era        : Int = (if (zDays >= 0) zDays else zDays - 146096) / 146097;
    let doe        : Int = zDays - era * 146097;
    let yoe        : Int = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let yearBase   : Int = yoe + era * 400;
    let doy        : Int = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let monthPrime : Int = (5 * doy + 2) / 153;
    let day        : Int = doy - (153 * monthPrime + 2) / 5 + 1;
    let month      : Int = if (monthPrime < 10) monthPrime + 3 else monthPrime - 9;
    let year       : Int = if (month <= 2) yearBase + 1 else yearBase;
    let pad2 = func(num : Nat) : Text { if (num < 10) "0" # Nat.toText(num) else Nat.toText(num) };
    let pad4 = func(num : Nat) : Text {
      if      (num < 10)   "000" # Nat.toText(num)
      else if (num < 100)  "00"  # Nat.toText(num)
      else if (num < 1000) "0"   # Nat.toText(num)
      else                        Nat.toText(num)
    };
    pad4(Int.abs(year)) # pad2(Int.abs(month)) # pad2(Int.abs(day))
    # "T" # pad2(hour) # pad2(minute) # pad2(second) # "Z"
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────

  public shared func setMeetingsCanisterId(canisterId : Text) : async () {
    meetingsCanisterId := canisterId;
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
    let ev : CalendarEvent = {
      id = nextId(); title; startAt; endAt; eventType; visibility; location;
      createdBy = msg.caller; createdAt = Time.now();
    };
    Map.add(events, Text.compare, ev.id, ev);
    #ok(ev)
  };

  public shared(msg) func deleteEvent(eventId : Text) : async Result.Result<(), Error> {
    switch (Map.get(events, Text.compare, eventId)) {
      case null { #err(#NotFound) };
      case (?ev) {
        if (ev.createdBy != msg.caller) return #err(#NotAuthorized);
        ignore Map.remove(events, Text.compare, eventId);
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getEvent(eventId : Text) : async ?CalendarEvent {
    Map.get(events, Text.compare, eventId)
  };

  public query func listEvents(startAt : Time.Time, endAt : Time.Time) : async [CalendarEvent] {
    Array.filter<CalendarEvent>(
      Iter.toArray(Map.values(events)),
      func(ev) { ev.startAt >= startAt and ev.startAt <= endAt }
    )
  };

  public query func getUpcomingEvents(limit : Nat) : async [CalendarEvent] {
    let now = Time.now();
    let all = Array.filter<CalendarEvent>(
      Iter.toArray(Map.values(events)),
      func(ev) { ev.startAt >= now }
    );
    if (all.size() <= limit) all
    else Array.tabulate<CalendarEvent>(limit, func(idx) { all[idx] })
  };

  // ─── iCal HTTP feed ───────────────────────────────────────────────────────

  public query func http_request(req : HttpRequest) : async HttpResponse {
    ignore req;
    var ical : Text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n";
    ical #= "PRODID:-//Quorum//HOA Calendar//EN\r\n";
    ical #= "CALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
    for (ev in Iter.fromArray(Iter.toArray(Map.values(events)))) {
      let typeLabel = switch (ev.eventType) {
        case (#Meeting)           "Meeting";
        case (#CommunityEvent)    "Community Event";
        case (#MaintenanceWindow) "Maintenance Window";
        case (#Holiday)           "Holiday";
      };
      ical #= "BEGIN:VEVENT\r\n";
      ical #= "UID:" # ev.id # "@quorum\r\n";
      ical #= "DTSTART:" # icalTs(ev.startAt) # "\r\n";
      ical #= "DTEND:"   # icalTs(ev.endAt)   # "\r\n";
      ical #= "SUMMARY:" # ev.title # "\r\n";
      ical #= "CATEGORIES:" # typeLabel # "\r\n";
      switch (ev.location) {
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

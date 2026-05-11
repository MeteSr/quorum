/**
 * Quorum — Meetings Canister
 *
 * Meeting records: agenda, attendance, motions, and minutes generation.
 * Closes the governance loop: recorded motions become the authoritative
 * record of board decisions.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Meetings {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type MeetingType = { #Annual; #Board; #Special };

  public type MotionOutcome = { #Passed; #Failed; #Tabled };

  public type MotionVotes = {
    forVotes:     Nat;
    againstVotes: Nat;
    abstainVotes: Nat;
  };

  public type Motion = {
    id:         Text;
    text:       Text;
    movedBy:    Text;
    secondedBy: Text;
    outcome:    MotionOutcome;
    votes:      MotionVotes;
  };

  public type AgendaItem = {
    id:           Text;
    title:        Text;
    presenter:    ?Text;
    durationMins: ?Nat;
    motions:      [Motion];
  };

  public type Meeting = {
    id:          Text;
    date:        Time.Time;
    meetingType: MeetingType;
    agendaItems: [AgendaItem];
    attendees:   [Principal];
    quorumMet:   Bool;
    minutesText: ?Text;
    createdBy:   Principal;
    createdAt:   Time.Time;
    updatedAt:   Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var meetingCounter   : Nat  = 0;
  private var motionCounter    : Nat  = 0;
  private var agendaCounter    : Nat  = 0;
  private var calendarCanisterId  : Text = "";
  private var documentsCanisterId : Text = "";

  private let meetings = Map.empty<Text, Meeting>();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private func nextMeetingId() : Text {
    meetingCounter += 1;
    "MTG_" # Nat.toText(meetingCounter)
  };

  private func nextAgendaId() : Text {
    agendaCounter += 1;
    "AGI_" # Nat.toText(agendaCounter)
  };

  private func nextMotionId() : Text {
    motionCounter += 1;
    "MOT_" # Nat.toText(motionCounter)
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────

  public shared func setCalendarCanisterId(canisterId : Text) : async () {
    calendarCanisterId := canisterId;
  };

  public shared func setDocumentsCanisterId(canisterId : Text) : async () {
    documentsCanisterId := canisterId;
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared(msg) func createMeeting(
    date         : Time.Time,
    meetingType  : MeetingType,
    agendaItems  : [Text]           // initial agenda item titles
  ) : async Result.Result<Meeting, Error> {
    if (date <= 0) return #err(#InvalidInput("date must be positive"));
    let items : [AgendaItem] = Array.tabulate<AgendaItem>(agendaItems.size(), func(idx) {
      { id = nextAgendaId(); title = agendaItems[idx]; presenter = null; durationMins = null; motions = [] }
    });
    let meeting : Meeting = {
      id          = nextMeetingId();
      date;
      meetingType;
      agendaItems = items;
      attendees   = [];
      quorumMet   = false;
      minutesText = null;
      createdBy   = msg.caller;
      createdAt   = Time.now();
      updatedAt   = Time.now();
    };
    Map.add(meetings, Text.compare, meeting.id, meeting);
    // Fire-and-forget: create calendar event if calendar canister is wired
    if (calendarCanisterId != "") {
      let cal = actor(calendarCanisterId) : actor {
        createEvent : (Text, Int, Int, { #Meeting; #CommunityEvent; #MaintenanceWindow; #Holiday }, { #All; #Board }, ?Text) -> async ();
      };
      ignore cal.createEvent(meeting.id # " — Meeting", date, date + 7_200_000_000_000, #Meeting, #All, null);
    };
    #ok(meeting)
  };

  public shared func addAgendaItem(
    meetingId    : Text,
    title        : Text,
    presenter    : ?Text,
    durationMins : ?Nat
  ) : async Result.Result<Meeting, Error> {
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    switch (Map.get(meetings, Text.compare, meetingId)) {
      case null { #err(#NotFound) };
      case (?meeting) {
        let newItem : AgendaItem = {
          id = nextAgendaId(); title; presenter; durationMins; motions = []
        };
        let newItems = Array.tabulate<AgendaItem>(meeting.agendaItems.size() + 1, func(idx) {
          if (idx < meeting.agendaItems.size()) meeting.agendaItems[idx] else newItem
        });
        let updated = { meeting with agendaItems = newItems; updatedAt = Time.now() };
        Map.add(meetings, Text.compare, meetingId, updated);
        #ok(updated)
      };
    }
  };

  public shared func recordAttendance(
    meetingId : Text,
    attendees : [Principal]
  ) : async Result.Result<Meeting, Error> {
    switch (Map.get(meetings, Text.compare, meetingId)) {
      case null { #err(#NotFound) };
      case (?meeting) {
        let updated = { meeting with attendees; quorumMet = attendees.size() > 0; updatedAt = Time.now() };
        Map.add(meetings, Text.compare, meetingId, updated);
        #ok(updated)
      };
    }
  };

  public shared func addMotion(
    meetingId   : Text,
    agendaItemId: Text,
    text        : Text,
    movedBy     : Text,
    secondedBy  : Text,
    outcome     : MotionOutcome,
    votes       : MotionVotes
  ) : async Result.Result<Meeting, Error> {
    if (Text.size(text) == 0) return #err(#InvalidInput("motion text required"));
    switch (Map.get(meetings, Text.compare, meetingId)) {
      case null { #err(#NotFound) };
      case (?meeting) {
        let motion : Motion = {
          id = nextMotionId(); text; movedBy; secondedBy; outcome; votes
        };
        let newItems = Array.tabulate<AgendaItem>(meeting.agendaItems.size(), func(agendaIdx) {
          let item = meeting.agendaItems[agendaIdx];
          if (item.id != agendaItemId) item
          else {
            let newMotions = Array.tabulate<Motion>(item.motions.size() + 1, func(motionIdx) {
              if (motionIdx < item.motions.size()) item.motions[motionIdx] else motion
            });
            { item with motions = newMotions }
          }
        });
        let updated = { meeting with agendaItems = newItems; updatedAt = Time.now() };
        Map.add(meetings, Text.compare, meetingId, updated);
        #ok(updated)
      };
    }
  };

  public shared func generateMinutes(meetingId : Text) : async Result.Result<Text, Error> {
    switch (Map.get(meetings, Text.compare, meetingId)) {
      case null { #err(#NotFound) };
      case (?meeting) {
        let typeLabel = switch (meeting.meetingType) {
          case (#Annual)  "Annual Meeting";
          case (#Board)   "Board Meeting";
          case (#Special) "Special Meeting";
        };
        var lines : Text = "MINUTES OF " # typeLabel # "\n";
        lines #= "Meeting ID: " # meeting.id # "\n";
        lines #= "Attendees: " # Nat.toText(meeting.attendees.size()) # "\n";
        lines #= "Quorum met: " # (if (meeting.quorumMet) "Yes" else "No") # "\n\n";
        lines #= "AGENDA\n";
        for (item in Iter.fromArray(meeting.agendaItems)) {
          lines #= "  " # item.title # "\n";
          for (motion in Iter.fromArray(item.motions)) {
            let outcomeLabel = switch (motion.outcome) {
              case (#Passed) "PASSED"; case (#Failed) "FAILED"; case (#Tabled) "TABLED";
            };
            lines #= "    MOTION: " # motion.text # " [" # outcomeLabel # "]\n";
            lines #= "    Moved by: " # motion.movedBy # "  Seconded by: " # motion.secondedBy # "\n";
            lines #= "    For: " # Nat.toText(motion.votes.forVotes)
                   # "  Against: " # Nat.toText(motion.votes.againstVotes)
                   # "  Abstain: " # Nat.toText(motion.votes.abstainVotes) # "\n";
          };
        };
        let updated = { meeting with minutesText = ?lines; updatedAt = Time.now() };
        Map.add(meetings, Text.compare, meetingId, updated);
        #ok(lines)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getMeeting(meetingId : Text) : async ?Meeting {
    Map.get(meetings, Text.compare, meetingId)
  };

  public query func getAllMeetings() : async [Meeting] {
    Iter.toArray(Map.values(meetings))
  };
}

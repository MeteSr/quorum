import { useEffect, useState } from "react";
import {
  createEvent, deleteEvent, listEvents,
  type CalendarEvent, type EventType, type EventVisibility,
} from "@/services/calendar";

const S = {
  ink:     "#0E0E0C",
  paper:   "#F7F6F2",
  rule:    "#C8C3B8",
  accent:  "#2563EB",
  muted:   "#7A7268",
  danger:  "#C94C2E",
  serif:   "'Georgia', serif",
  mono:    "'IBM Plex Mono', monospace",
  sans:    "'IBM Plex Sans', sans-serif",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  Meeting:           "#2563EB",
  CommunityEvent:    "#166534",
  MaintenanceWindow: "#92400E",
  Holiday:           "#6D28D9",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  Meeting:           "Meeting",
  CommunityEvent:    "Community Event",
  MaintenanceWindow: "Maintenance",
  Holiday:           "Holiday",
};

function getEventTypeKey(e: CalendarEvent): string {
  return Object.keys(e.eventType)[0];
}

function formatDateTime(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Build a 6-week grid for the given month
function buildCalendarGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear]       = useState(today.getFullYear());
  const [month, setMonth]     = useState(today.getMonth());
  const [events, setEvents]   = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newTitle, setNewTitle]         = useState("");
  const [newStart, setNewStart]         = useState("");
  const [newEnd, setNewEnd]             = useState("");
  const [newType, setNewType]           = useState("Meeting");
  const [newVisibility, setNewVisibility] = useState("All");
  const [newLocation, setNewLocation]   = useState("");
  const [creating, setCreating]         = useState(false);

  function loadEvents(y: number, m: number) {
    setLoading(true);
    const startAt = BigInt(new Date(y, m, 1).getTime()) * 1_000_000n;
    const endAt   = BigInt(new Date(y, m + 1, 0, 23, 59, 59).getTime()) * 1_000_000n;
    listEvents(startAt, endAt)
      .then(setEvents)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadEvents(year, month); }, [year, month]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newStart || !newEnd) return;
    setCreating(true);
    try {
      const startNs = BigInt(new Date(newStart).getTime()) * 1_000_000n;
      const endNs   = BigInt(new Date(newEnd).getTime())   * 1_000_000n;
      const eventType: EventType       = { [newType]: null } as any;
      const visibility: EventVisibility = { [newVisibility]: null } as any;
      const ev = await createEvent(
        newTitle.trim(), startNs, endNs, eventType, visibility,
        newLocation.trim() || undefined
      );
      setEvents(prev => [...prev, ev]);
      setShowCreate(false);
      setNewTitle(""); setNewStart(""); setNewEnd(""); setNewLocation("");
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }

  const grid   = buildCalendarGrid(year, month);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function eventsForDate(d: Date): CalendarEvent[] {
    const start = d.getTime() * 1_000_000;
    const end   = start + 86_400_000 * 1_000_000;
    return events.filter(e => Number(e.startAt) >= start && Number(e.startAt) < end);
  }

  return (
    <div style={{ padding: "32px 40px", fontFamily: S.sans, color: S.ink, background: S.paper, minHeight: "calc(100vh - 56px)" }}>

      {error && (
        <div style={{ marginBottom: 20, padding: "10px 16px", background: "#FEE2E2", border: `1px solid ${S.danger}`, color: S.danger, fontFamily: S.mono, fontSize: "0.75rem" }}>
          {error}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={prevMonth} style={{ background: "none", border: `1px solid ${S.rule}`, padding: "4px 10px", cursor: "pointer", fontFamily: S.mono, fontSize: "0.75rem" }}>←</button>
          <h1 style={{ fontFamily: S.serif, fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {MONTHS[month]} {year}
          </h1>
          <button onClick={nextMonth} style={{ background: "none", border: `1px solid ${S.rule}`, padding: "4px 10px", cursor: "pointer", fontFamily: S.mono, fontSize: "0.75rem" }}>→</button>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "6px 14px", cursor: "pointer" }}>
          + New Event
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ marginBottom: 24, padding: "20px 24px", border: `1px solid ${S.rule}`, background: "#fff" }}>
          <h3 style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.muted, margin: "0 0 16px" }}>New Event</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Title</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Start</label>
              <input type="datetime-local" value={newStart} onChange={e => setNewStart(e.target.value)}
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>End</label>
              <input type="datetime-local" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Location</label>
              <input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Optional"
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                style={{ border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", background: "#fff" }}>
                <option value="Meeting">Meeting</option>
                <option value="CommunityEvent">Community Event</option>
                <option value="MaintenanceWindow">Maintenance Window</option>
                <option value="Holiday">Holiday</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Visibility</label>
              <select value={newVisibility} onChange={e => setNewVisibility(e.target.value)}
                style={{ border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", background: "#fff" }}>
                <option value="All">All Members</option>
                <option value="Board">Board Only</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreate} disabled={creating || !newTitle.trim() || !newStart || !newEnd}
              style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "6px 16px", cursor: "pointer", opacity: creating ? 0.6 : 1 }}>
              {creating ? "Creating…" : "Create Event"}
            </button>
            <button onClick={() => setShowCreate(false)}
              style={{ fontFamily: S.mono, fontSize: "0.7rem", border: `1px solid ${S.rule}`, background: "transparent", padding: "6px 12px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: `1px solid ${S.rule}`, borderLeft: `1px solid ${S.rule}` }}>
        {DAYS.map(d => (
          <div key={d} style={{ padding: "6px 10px", borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", color: S.muted, textAlign: "center" }}>
            {d}
          </div>
        ))}

        {/* Calendar grid */}
        {grid.map((d, idx) => {
          const isCurrentMonth = d.getMonth() === month;
          const isToday = d.toDateString() === today.toDateString();
          const dayEvents = eventsForDate(d);
          return (
            <div key={idx} style={{
              minHeight: 80, padding: "6px 8px", borderRight: `1px solid ${S.rule}`, borderBottom: `1px solid ${S.rule}`,
              background: isToday ? "#EFF6FF" : isCurrentMonth ? "#fff" : S.paper,
            }}>
              <span style={{
                fontFamily: S.mono, fontSize: "0.7rem",
                color: isToday ? S.accent : isCurrentMonth ? S.ink : S.muted,
                fontWeight: isToday ? 700 : 400,
              }}>
                {d.getDate()}
              </span>
              {dayEvents.map(ev => {
                const typeKey = getEventTypeKey(ev);
                return (
                  <div key={ev.id} style={{ marginTop: 2, padding: "1px 5px", fontSize: "0.65rem", fontFamily: S.mono, background: EVENT_TYPE_COLORS[typeKey] ?? S.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ev.title}</span>
                    <button onClick={() => handleDelete(ev.id)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "0.6rem", padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Upcoming list */}
      {events.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.muted, borderBottom: `1px solid ${S.rule}`, paddingBottom: 6, marginBottom: 16 }}>
            This Month
          </h2>
          {events
            .slice()
            .sort((a, b) => (a.startAt > b.startAt ? 1 : -1))
            .map(ev => {
              const typeKey = getEventTypeKey(ev);
              return (
                <div key={ev.id} style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "10px 0", borderBottom: `1px solid ${S.rule}` }}>
                  <div style={{ width: 10, height: 10, background: EVENT_TYPE_COLORS[typeKey] ?? S.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{ev.title}</span>
                    {ev.location[0] && <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.muted }}> · {ev.location[0]}</span>}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.muted, whiteSpace: "nowrap" }}>
                    {formatDateTime(ev.startAt)}
                  </div>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", padding: "2px 6px", background: EVENT_TYPE_COLORS[typeKey] ?? S.accent, color: "#fff" }}>
                    {EVENT_TYPE_LABELS[typeKey]}
                  </span>
                </div>
              );
            })}
        </section>
      )}

      {loading && (
        <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.muted, marginTop: 20 }}>Loading…</p>
      )}
    </div>
  );
}

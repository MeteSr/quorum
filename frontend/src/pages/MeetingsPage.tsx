import { useEffect, useState } from "react";
import {
  createMeeting, addAgendaItem, recordAttendance, addMotion,
  generateMinutes, getAllMeetings,
  type Meeting, type MeetingType, type MotionOutcome,
} from "@/services/meetings";

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

const MEETING_TYPE_LABELS: Record<string, string> = {
  Annual: "Annual Meeting",
  Board:  "Board Meeting",
  Special: "Special Meeting",
};

function formatDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleDateString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
}

export default function MeetingsPage() {
  const [meetings, setMeetings]       = useState<Meeting[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<Meeting | null>(null);
  const [minutes, setMinutes]         = useState<string | null>(null);
  const [showCreate, setShowCreate]   = useState(false);

  // Create form state
  const [newDate, setNewDate]           = useState("");
  const [newType, setNewType]           = useState<string>("Board");
  const [newAgenda, setNewAgenda]       = useState("");
  const [creating, setCreating]         = useState(false);

  // Agenda item form
  const [agendaTitle, setAgendaTitle]   = useState("");
  const [agendaPresenter, setAgendaPresenter] = useState("");
  const [addingItem, setAddingItem]     = useState(false);

  // Motion form
  const [motionText, setMotionText]         = useState("");
  const [motionMovedBy, setMotionMovedBy]   = useState("");
  const [motionSecondedBy, setMotionSecondedBy] = useState("");
  const [motionOutcome, setMotionOutcome]   = useState<string>("Passed");
  const [motionAgendaId, setMotionAgendaId] = useState("");
  const [addingMotion, setAddingMotion]     = useState(false);

  useEffect(() => {
    getAllMeetings()
      .then(list => setMeetings(list.sort((a, b) => Number(b.date - a.date))))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newDate) return;
    setCreating(true);
    try {
      const dateNs = BigInt(new Date(newDate).getTime()) * 1_000_000n;
      const type: MeetingType = { [newType]: null } as any;
      const titles = newAgenda.split("\n").map(t => t.trim()).filter(Boolean);
      const m = await createMeeting(dateNs, type, titles);
      setMeetings(prev => [m, ...prev]);
      setSelected(m);
      setShowCreate(false);
      setNewDate(""); setNewType("Board"); setNewAgenda("");
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleAddItem() {
    if (!selected || !agendaTitle.trim()) return;
    setAddingItem(true);
    try {
      const updated = await addAgendaItem(
        selected.id, agendaTitle.trim(),
        agendaPresenter.trim() || undefined
      );
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));
      setSelected(updated);
      setAgendaTitle(""); setAgendaPresenter("");
    } catch (e) {
      setError(String(e));
    } finally {
      setAddingItem(false);
    }
  }

  async function handleAddMotion() {
    if (!selected || !motionAgendaId || !motionText.trim()) return;
    setAddingMotion(true);
    try {
      const outcome: MotionOutcome = { [motionOutcome]: null } as any;
      const updated = await addMotion(
        selected.id, motionAgendaId,
        motionText.trim(), motionMovedBy.trim(), motionSecondedBy.trim(),
        outcome,
        { forVotes: 0n, againstVotes: 0n, abstainVotes: 0n }
      );
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));
      setSelected(updated);
      setMotionText(""); setMotionMovedBy(""); setMotionSecondedBy(""); setMotionAgendaId("");
    } catch (e) {
      setError(String(e));
    } finally {
      setAddingMotion(false);
    }
  }

  async function handleGenerateMinutes() {
    if (!selected) return;
    try {
      const text = await generateMinutes(selected.id);
      setMinutes(text);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRecordAttendance() {
    if (!selected) return;
    try {
      const updated = await recordAttendance(selected.id, []);
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));
      setSelected(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: S.mono, color: S.muted }}>Loading…</div>;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", fontFamily: S.sans, color: S.ink, background: S.paper }}>

      {/* Sidebar */}
      <aside style={{ width: 280, borderRight: `1px solid ${S.rule}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.muted }}>Meetings</span>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "4px 10px", cursor: "pointer" }}
          >
            + New
          </button>
        </div>

        {showCreate && (
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.rule}`, background: "#EDEAE3" }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Date</label>
              <input type="datetime-local" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "4px 6px", fontFamily: S.sans, fontSize: "0.8rem", background: "#fff", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "4px 6px", fontFamily: S.sans, fontSize: "0.8rem", background: "#fff", boxSizing: "border-box" }}>
                <option value="Board">Board Meeting</option>
                <option value="Annual">Annual Meeting</option>
                <option value="Special">Special Meeting</option>
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 4 }}>Agenda items (one per line)</label>
              <textarea value={newAgenda} onChange={e => setNewAgenda(e.target.value)} rows={3}
                placeholder="Approve minutes&#10;Financial report&#10;Open floor"
                style={{ width: "100%", border: `1px solid ${S.rule}`, padding: "4px 6px", fontFamily: S.sans, fontSize: "0.8rem", resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <button onClick={handleCreate} disabled={creating || !newDate}
              style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "6px 14px", cursor: creating ? "wait" : "pointer", opacity: creating ? 0.6 : 1 }}>
              {creating ? "Creating…" : "Create Meeting"}
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {meetings.length === 0 && (
            <p style={{ padding: "20px", fontFamily: S.mono, fontSize: "0.75rem", color: S.muted }}>No meetings yet.</p>
          )}
          {meetings.map(m => {
            const typeKey = Object.keys(m.meetingType)[0];
            return (
              <button key={m.id} onClick={() => { setSelected(m); setMinutes(null); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "12px 20px",
                  background: selected?.id === m.id ? "#E8E4DC" : "transparent",
                  border: "none", borderBottom: `1px solid ${S.rule}`, cursor: "pointer",
                }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", color: S.muted, marginBottom: 2 }}>
                  {MEETING_TYPE_LABELS[typeKey] ?? typeKey}
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{formatDate(m.date)}</div>
                <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.muted, marginTop: 2 }}>
                  {m.agendaItems.length} item{m.agendaItems.length !== 1 ? "s" : ""}
                  {m.quorumMet ? " · quorum met" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Detail panel */}
      <main style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        {error && (
          <div style={{ marginBottom: 20, padding: "10px 16px", background: "#FEE2E2", border: `1px solid ${S.danger}`, color: S.danger, fontFamily: S.mono, fontSize: "0.75rem" }}>
            {error}
          </div>
        )}

        {!selected ? (
          <div style={{ color: S.muted, fontFamily: S.mono, fontSize: "0.8rem", marginTop: 80, textAlign: "center" }}>
            Select a meeting or create a new one
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontFamily: S.serif, fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>
                  {MEETING_TYPE_LABELS[Object.keys(selected.meetingType)[0]]}
                </h1>
                <p style={{ fontFamily: S.mono, fontSize: "0.72rem", color: S.muted, margin: "4px 0 0" }}>
                  {formatDate(selected.date)} · {selected.id}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleRecordAttendance}
                  style={{ fontFamily: S.mono, fontSize: "0.7rem", border: `1px solid ${S.rule}`, background: "transparent", padding: "5px 12px", cursor: "pointer" }}>
                  Record Attendance
                </button>
                <button onClick={handleGenerateMinutes}
                  style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "5px 12px", cursor: "pointer" }}>
                  Generate Minutes
                </button>
              </div>
            </div>

            {/* Agenda */}
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.muted, borderBottom: `1px solid ${S.rule}`, paddingBottom: 6, marginBottom: 16 }}>
                Agenda
              </h2>
              {selected.agendaItems.length === 0 && (
                <p style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.muted }}>No agenda items yet.</p>
              )}
              {selected.agendaItems.map((item, idx) => (
                <div key={item.id} style={{ marginBottom: 16, padding: "12px 16px", border: `1px solid ${S.rule}`, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
                    <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.muted }}>{idx + 1}.</span>
                    <span style={{ fontWeight: 500 }}>{item.title}</span>
                    {item.presenter[0] && (
                      <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.muted }}>— {item.presenter[0]}</span>
                    )}
                  </div>
                  {item.motions.length > 0 && (
                    <div style={{ marginTop: 8, paddingLeft: 16 }}>
                      {item.motions.map(mo => {
                        const outcomeKey = Object.keys(mo.outcome)[0];
                        const outcomeColor = outcomeKey === "Passed" ? "#166534" : outcomeKey === "Failed" ? S.danger : S.muted;
                        return (
                          <div key={mo.id} style={{ marginBottom: 6, fontFamily: S.mono, fontSize: "0.7rem" }}>
                            <span style={{ color: outcomeColor, fontWeight: 600 }}>[{outcomeKey.toUpperCase()}]</span>
                            {" "}{mo.text}
                            <span style={{ color: S.muted }}> — moved: {mo.movedBy}, seconded: {mo.secondedBy}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button onClick={() => setMotionAgendaId(item.id)}
                    style={{ marginTop: 6, fontFamily: S.mono, fontSize: "0.62rem", border: `1px solid ${S.rule}`, background: "transparent", padding: "2px 8px", cursor: "pointer", color: S.muted }}>
                    + Motion
                  </button>
                </div>
              ))}

              {/* Add agenda item */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input value={agendaTitle} onChange={e => setAgendaTitle(e.target.value)}
                  placeholder="New agenda item title"
                  style={{ flex: 1, border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem" }} />
                <input value={agendaPresenter} onChange={e => setAgendaPresenter(e.target.value)}
                  placeholder="Presenter (optional)"
                  style={{ width: 160, border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem" }} />
                <button onClick={handleAddItem} disabled={addingItem || !agendaTitle.trim()}
                  style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "6px 14px", cursor: "pointer", opacity: addingItem ? 0.6 : 1 }}>
                  Add
                </button>
              </div>
            </section>

            {/* Motion form */}
            {motionAgendaId && (
              <section style={{ marginBottom: 32, padding: "16px", border: `1px solid ${S.rule}`, background: "#FAFAF8" }}>
                <h2 style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.muted, marginBottom: 12 }}>
                  Add Motion — {selected.agendaItems.find(i => i.id === motionAgendaId)?.title}
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input value={motionMovedBy} onChange={e => setMotionMovedBy(e.target.value)} placeholder="Moved by"
                    style={{ border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem" }} />
                  <input value={motionSecondedBy} onChange={e => setMotionSecondedBy(e.target.value)} placeholder="Seconded by"
                    style={{ border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem" }} />
                  <select value={motionOutcome} onChange={e => setMotionOutcome(e.target.value)}
                    style={{ border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem", background: "#fff" }}>
                    <option value="Passed">Passed</option>
                    <option value="Failed">Failed</option>
                    <option value="Tabled">Tabled</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={motionText} onChange={e => setMotionText(e.target.value)} placeholder="Motion text"
                    style={{ flex: 1, border: `1px solid ${S.rule}`, padding: "6px 10px", fontFamily: S.sans, fontSize: "0.8rem" }} />
                  <button onClick={handleAddMotion} disabled={addingMotion || !motionText.trim()}
                    style={{ fontFamily: S.mono, fontSize: "0.7rem", background: S.accent, color: "#fff", border: "none", padding: "6px 14px", cursor: "pointer", opacity: addingMotion ? 0.6 : 1 }}>
                    Record
                  </button>
                  <button onClick={() => setMotionAgendaId("")}
                    style={{ fontFamily: S.mono, fontSize: "0.7rem", border: `1px solid ${S.rule}`, background: "transparent", padding: "6px 10px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </section>
            )}

            {/* Minutes */}
            {minutes && (
              <section>
                <h2 style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.muted, borderBottom: `1px solid ${S.rule}`, paddingBottom: 6, marginBottom: 16 }}>
                  Minutes
                </h2>
                <pre style={{ fontFamily: S.mono, fontSize: "0.75rem", background: "#fff", border: `1px solid ${S.rule}`, padding: "16px 20px", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {minutes}
                </pre>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

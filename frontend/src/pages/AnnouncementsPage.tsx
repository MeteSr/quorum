import { useEffect, useState } from "react";
import {
  getAll, post, deleteAnnouncement,
  broadcastEmergency, getBroadcasts,
  type Announcement, type Priority, type Broadcast, type Severity,
} from "@/services/announcements";

const styles = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  amber:    "#D4860A",
  sage:     "#4A7C59",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

const SEVERITY_COLORS: Record<string, string> = {
  Emergency: styles.rust,
  Warning:   styles.amber,
  Info:      styles.navy,
};

function severityKey(s: Severity): string {
  if ("Emergency" in s) return "Emergency";
  if ("Warning" in s)   return "Warning";
  return "Info";
}

export default function AnnouncementsPage() {
  const [notices,      setNotices]      = useState<Announcement[]>([]);
  const [broadcasts,   setBroadcasts]   = useState<Broadcast[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<"announcements" | "broadcasts">("announcements");

  // Announcement form
  const [showPost,     setShowPost]     = useState(false);
  const [title,        setTitle]        = useState("");
  const [body,         setBody]         = useState("");
  const [priority,     setPriority]     = useState<Priority>({ Normal: null });
  const [posting,      setPosting]      = useState(false);
  const [postError,    setPostError]    = useState<string | null>(null);

  // Broadcast form
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bTitle,        setBTitle]        = useState("");
  const [bBody,         setBBody]         = useState("");
  const [bSeverity,     setBSeverity]     = useState<Severity>({ Info: null });
  const [bPosting,      setBPosting]      = useState(false);
  const [bError,        setBError]        = useState<string | null>(null);
  const [confirmEmerg,  setConfirmEmerg]  = useState(false);

  useEffect(() => {
    Promise.all([getAll(), getBroadcasts()])
      .then(([n, b]) => { setNotices(n); setBroadcasts(b); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    setPostError(null);
    try {
      const result = await post(title, body, priority, []);
      if ("ok" in result) {
        setNotices((n) => [result.ok, ...n]);
        setShowPost(false);
        setTitle(""); setBody("");
      } else {
        const err = result.err;
        setPostError("NotAuthorized" in err ? "Board members only." : "Post failed.");
      }
    } catch {
      setPostError("Post failed.");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteAnnouncement(id);
    setNotices((n) => n.filter((x) => x.id !== id));
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if ("Emergency" in bSeverity && !confirmEmerg) {
      setConfirmEmerg(true);
      return;
    }
    setBPosting(true);
    setBError(null);
    try {
      const result = await broadcastEmergency(bTitle, bBody, bSeverity);
      if ("ok" in result) {
        setBroadcasts((b) => [result.ok, ...b]);
        setShowBroadcast(false);
        setBTitle(""); setBBody("");
        setBSeverity({ Info: null });
        setConfirmEmerg(false);
      } else {
        const err = result.err;
        setBError("NotAuthorized" in err ? "Board members only." : "Broadcast failed.");
      }
    } catch {
      setBError("Broadcast failed.");
    } finally {
      setBPosting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem",
    border: `1px solid ${styles.rule}`, fontFamily: styles.sans,
    fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    display: "block", fontFamily: styles.mono, fontSize: "0.6rem",
    letterSpacing: "0.1em", textTransform: "uppercase",
    color: styles.inkLight, marginBottom: "0.3rem",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontFamily: styles.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Announcements</h1>
          <p style={{ color: styles.inkLight, fontFamily: styles.sans, fontSize: "0.9rem" }}>Community notices and emergency broadcasts</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {tab === "announcements" && (
            <button
              onClick={() => setShowPost(!showPost)}
              style={{ padding: "0.5rem 1rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
            >
              {showPost ? "Cancel" : "Post"}
            </button>
          )}
          {tab === "broadcasts" && (
            <button
              onClick={() => { setShowBroadcast(!showBroadcast); setConfirmEmerg(false); }}
              style={{ padding: "0.5rem 1rem", background: styles.rust, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
            >
              {showBroadcast ? "Cancel" : "Broadcast"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${styles.rule}`, marginBottom: "1.5rem" }}>
        {(["announcements", "broadcasts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none", border: "none", borderBottom: tab === t ? `2px solid ${styles.navy}` : "2px solid transparent",
              padding: "0.5rem 1.25rem", fontFamily: styles.mono, fontSize: "0.65rem",
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: tab === t ? styles.navy : styles.inkLight, cursor: "pointer",
            }}
          >
            {t === "announcements" ? "Notices" : "Broadcasts"}
            {t === "broadcasts" && broadcasts.length > 0 && (
              <span style={{ marginLeft: "0.4rem", background: styles.rust, color: "#fff", fontFamily: styles.mono, fontSize: "0.5rem", padding: "0.1rem 0.35rem" }}>
                {broadcasts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Announcement post form */}
      {tab === "announcements" && showPost && (
        <form onSubmit={handlePost} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div><label style={label}>Title</label><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><label style={label}>Body</label><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} required /></div>
          <div>
            <label style={label}>Priority</label>
            <select style={{ ...inputStyle, background: "#fff" }} value={"Urgent" in priority ? "Urgent" : "Normal"} onChange={(e) => setPriority(e.target.value === "Urgent" ? { Urgent: null } : { Normal: null })}>
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          {postError && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.rust, margin: 0 }}>{postError}</p>}
          <button type="submit" disabled={posting} style={{ padding: "0.75rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {posting ? "Posting…" : "Post Announcement"}
          </button>
        </form>
      )}

      {/* Broadcast form */}
      {tab === "broadcasts" && showBroadcast && (
        <form onSubmit={handleBroadcast} style={{ border: `1px solid ${styles.rust}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: styles.rust, textTransform: "uppercase" }}>Emergency Broadcast — Board Only</div>
          <div><label style={label}>Title (max 80 chars)</label><input style={inputStyle} maxLength={80} value={bTitle} onChange={(e) => setBTitle(e.target.value)} required /></div>
          <div><label style={label}>Message (max 300 chars)</label><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} maxLength={300} value={bBody} onChange={(e) => setBBody(e.target.value)} required /></div>
          <div>
            <label style={label}>Severity</label>
            <select
              style={{ ...inputStyle, background: "#fff" }}
              value={"Emergency" in bSeverity ? "Emergency" : "Warning" in bSeverity ? "Warning" : "Info"}
              onChange={(e) => {
                setConfirmEmerg(false);
                setBSeverity(e.target.value === "Emergency" ? { Emergency: null } : e.target.value === "Warning" ? { Warning: null } : { Info: null });
              }}
            >
              <option value="Info">Info</option>
              <option value="Warning">Warning</option>
              <option value="Emergency">Emergency</option>
            </select>
          </div>
          {confirmEmerg && (
            <div style={{ border: `1px solid ${styles.rust}`, padding: "0.75rem", background: "#fff5f5", fontFamily: styles.sans, fontSize: "0.85rem", color: styles.rust }}>
              ⚠ You are about to send an EMERGENCY broadcast to all residents. Submit again to confirm.
            </div>
          )}
          {bError && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.rust, margin: 0 }}>{bError}</p>}
          <button type="submit" disabled={bPosting} style={{ padding: "0.75rem", background: styles.rust, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {bPosting ? "Sending…" : confirmEmerg ? "Confirm Emergency Broadcast" : "Send Broadcast"}
          </button>
        </form>
      )}

      {loading && <p style={{ fontFamily: styles.sans, color: styles.inkLight }}>Loading…</p>}

      {/* Announcements list */}
      {!loading && tab === "announcements" && (
        <>
          {notices.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO ANNOUNCEMENTS
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {notices.map((n) => {
              const isUrgent = "Urgent" in n.priority;
              return (
                <div key={n.id} style={{ border: `1px solid ${isUrgent ? styles.amber : styles.rule}`, padding: "1.25rem 1.5rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      {isUrgent && <div style={{ fontFamily: styles.mono, fontSize: "0.58rem", letterSpacing: "0.1em", color: styles.amber, textTransform: "uppercase", marginBottom: "0.3rem" }}>URGENT</div>}
                      <div style={{ fontFamily: styles.sans, fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.4rem" }}>{n.title}</div>
                      <div style={{ fontFamily: styles.sans, fontSize: "0.875rem", color: styles.inkLight }}>{n.body}</div>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.58rem", color: styles.inkLight, letterSpacing: "0.06em", marginTop: "0.5rem" }}>
                        {new Date(Number(n.postedAt) / 1_000_000).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(n.id)} style={{ background: "none", border: "none", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.6rem", cursor: "pointer", padding: "0 0 0 1rem", flexShrink: 0 }}>
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Broadcasts list */}
      {!loading && tab === "broadcasts" && (
        <>
          {broadcasts.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO BROADCASTS
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {broadcasts.map((b) => {
              const sk = severityKey(b.severity);
              const color = SEVERITY_COLORS[sk];
              return (
                <div key={b.id} style={{ border: `2px solid ${color}`, padding: "1.25rem 1.5rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.58rem", letterSpacing: "0.1em", color, textTransform: "uppercase", marginBottom: "0.3rem" }}>
                        {sk}
                      </div>
                      <div style={{ fontFamily: styles.sans, fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.4rem" }}>{b.title}</div>
                      <div style={{ fontFamily: styles.sans, fontSize: "0.875rem", color: styles.inkLight }}>{b.body}</div>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.58rem", color: styles.inkLight, letterSpacing: "0.06em", marginTop: "0.5rem" }}>
                        {new Date(Number(b.sentAt) / 1_000_000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

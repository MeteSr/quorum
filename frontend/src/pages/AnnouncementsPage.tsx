import { useEffect, useState } from "react";
import { getAll, post, deleteAnnouncement, type Announcement, type Priority } from "@/services/announcements";

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  amber:    "#D4860A",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

export default function AnnouncementsPage() {
  const [notices,     setNotices]    = useState<Announcement[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [showPost,    setShowPost]   = useState(false);
  const [title,       setTitle]      = useState("");
  const [body,        setBody]       = useState("");
  const [priority,    setPriority]   = useState<Priority>({ Normal: null });
  const [posting,     setPosting]    = useState(false);
  const [postError,   setPostError]  = useState<string | null>(null);

  useEffect(() => {
    getAll().then(setNotices).catch(() => {}).finally(() => setLoading(false));
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

  const inputStyle = { width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Announcements</h1>
          <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem" }}>Community notices and alerts</p>
        </div>
        <button
          onClick={() => setShowPost(!showPost)}
          style={{ padding: "0.5rem 1rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showPost ? "Cancel" : "Post"}
        </button>
      </div>

      {showPost && (
        <form onSubmit={handlePost} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Title</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Body</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Priority</label>
            <select style={{ ...inputStyle, background: "#fff" }} value={"Urgent" in priority ? "Urgent" : "Normal"} onChange={(e) => setPriority(e.target.value === "Urgent" ? { Urgent: null } : { Normal: null })}>
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          {postError && <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, margin: 0 }}>{postError}</p>}
          <button type="submit" disabled={posting} style={{ padding: "0.75rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {posting ? "Posting…" : "Post Announcement"}
          </button>
        </form>
      )}

      {loading && <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading announcements…</p>}

      {!loading && notices.length === 0 && (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO ANNOUNCEMENTS
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {notices.map((n) => {
          const isUrgent = "Urgent" in n.priority;
          return (
            <div key={n.id} style={{ border: `1px solid ${isUrgent ? S.amber : S.rule}`, padding: "1.25rem 1.5rem", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  {isUrgent && (
                    <div style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.1em", color: S.amber, textTransform: "uppercase", marginBottom: "0.3rem" }}>URGENT</div>
                  )}
                  <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.4rem" }}>{n.title}</div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight }}>{n.body}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.58rem", color: S.inkLight, letterSpacing: "0.06em", marginTop: "0.5rem" }}>
                    {new Date(Number(n.postedAt) / 1_000_000).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  style={{ background: "none", border: "none", color: S.inkLight, fontFamily: S.mono, fontSize: "0.6rem", cursor: "pointer", padding: "0 0 0 1rem", flexShrink: 0 }}
                >
                  DELETE
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

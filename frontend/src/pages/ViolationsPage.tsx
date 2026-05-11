import { useEffect, useState } from "react";
import {
  getAllViolations,
  createViolation,
  addReply,
  updateStatus,
  type Violation,
  type ViolationCategory,
  type ViolationStatus,
} from "@/services/violations";

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  amber:    "#D4860A",
  green:    "#2E7D32",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: "Parking",     label: "Parking"     },
  { value: "Noise",       label: "Noise"       },
  { value: "Landscaping", label: "Landscaping" },
  { value: "Pet",         label: "Pet"         },
  { value: "Other",       label: "Other"       },
];

const STATUS_LABELS: Record<string, string> = {
  Open:        "Open",
  UnderReview: "Under Review",
  Resolved:    "Resolved",
};

const STATUS_COLORS: Record<string, string> = {
  Open:        S.rust,
  UnderReview: S.amber,
  Resolved:    S.green,
};

function categoryLabel(cat: ViolationCategory): string {
  return Object.keys(cat)[0];
}

function statusLabel(st: ViolationStatus): string {
  const key = Object.keys(st)[0];
  return STATUS_LABELS[key] ?? key;
}

function statusColor(st: ViolationStatus): string {
  const key = Object.keys(st)[0];
  return STATUS_COLORS[key] ?? S.inkLight;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`,
  fontFamily: S.sans, fontSize: "0.875rem", outline: "none",
  boxSizing: "border-box", background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: S.mono, fontSize: "0.6rem",
  letterSpacing: "0.1em", textTransform: "uppercase",
  color: S.inkLight, marginBottom: "0.3rem",
};

export default function ViolationsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);

  // form state
  const [unitId,      setUnitId]      = useState("");
  const [category,    setCategory]    = useState("Parking");
  const [description, setDescription] = useState("");
  const [photoHash,   setPhotoHash]   = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);

  // reply state
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyText,   setReplyText]   = useState("");

  useEffect(() => {
    getAllViolations()
      .then(setViolations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const cat = { [category]: null } as ViolationCategory;
      const hash: [] | [string] = photoHash.trim() ? [photoHash.trim()] : [];
      const result = await createViolation(unitId, cat, description, hash);
      if ("ok" in result) {
        setViolations((v) => [result.ok, ...v]);
        setShowForm(false);
        setUnitId(""); setDescription(""); setPhotoHash("");
      } else {
        const e = result.err;
        setFormError("InvalidInput" in e ? e.InvalidInput : "Submission failed.");
      }
    } catch {
      setFormError("Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(violationId: string) {
    if (!replyText.trim()) return;
    const result = await addReply(violationId, replyText.trim());
    if ("ok" in result) {
      setViolations((v) => v.map((x) => x.id === violationId ? result.ok : x));
      setReplyTarget(null);
      setReplyText("");
    }
  }

  async function handleStatusChange(violationId: string, st: ViolationStatus) {
    const result = await updateStatus(violationId, st);
    if ("ok" in result) {
      setViolations((v) => v.map((x) => x.id === violationId ? result.ok : x));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Violations</h1>
          <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem" }}>Community standards enforcement</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ padding: "0.5rem 1rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showForm ? "Cancel" : "Report"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>Unit</label>
            <input style={inputStyle} value={unitId} onChange={(e) => setUnitId(e.target.value)} required placeholder="e.g. 4B" />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Photo Hash (optional)</label>
            <input style={inputStyle} value={photoHash} onChange={(e) => setPhotoHash(e.target.value)} placeholder="SHA-256 hash" />
          </div>
          {formError && <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, margin: 0 }}>{formError}</p>}
          <button type="submit" disabled={submitting} style={{ padding: "0.75rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {submitting ? "Submitting…" : "Submit Violation"}
          </button>
        </form>
      )}

      {loading && <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading violations…</p>}

      {!loading && violations.length === 0 && (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO VIOLATIONS REPORTED
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {violations.map((v) => (
          <div key={v.id} style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  {categoryLabel(v.category)} — Unit {v.unitId}
                </div>
                <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.95rem" }}>{v.description}</div>
                {v.photoHash.length > 0 && (
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.25rem" }}>
                    PHOTO: {v.photoHash[0]}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", color: statusColor(v.status), textTransform: "uppercase" }}>
                  {statusLabel(v.status)}
                </span>
                <select
                  value={Object.keys(v.status)[0]}
                  onChange={(e) => handleStatusChange(v.id, { [e.target.value]: null } as ViolationStatus)}
                  style={{ fontFamily: S.mono, fontSize: "0.55rem", border: `1px solid ${S.rule}`, padding: "0.2rem 0.4rem", background: "#fff", cursor: "pointer" }}
                >
                  <option value="Open">Open</option>
                  <option value="UnderReview">Under Review</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            </div>

            {v.replies.length > 0 && (
              <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "0.75rem", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {v.replies.map((r, i) => (
                  <div key={i} style={{ fontFamily: S.sans, fontSize: "0.825rem", color: S.inkLight }}>
                    <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", marginRight: "0.5rem" }}>
                      {new Date(Number(r.createdAt) / 1_000_000).toLocaleDateString()}
                    </span>
                    {r.text}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "0.75rem" }}>
              {replyTarget === v.id ? (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Add a reply…"
                    autoFocus
                  />
                  <button
                    onClick={() => handleReply(v.id)}
                    style={{ padding: "0.5rem 1rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                  >
                    Send
                  </button>
                  <button
                    onClick={() => { setReplyTarget(null); setReplyText(""); }}
                    style={{ padding: "0.5rem 0.75rem", background: "none", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setReplyTarget(v.id)}
                  style={{ background: "none", border: "none", color: S.inkLight, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}
                >
                  Reply
                </button>
              )}
            </div>

            <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, letterSpacing: "0.05em", marginTop: "0.75rem" }}>
              {new Date(Number(v.createdAt) / 1_000_000).toLocaleDateString()} — {v.id}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

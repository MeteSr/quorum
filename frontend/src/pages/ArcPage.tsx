import { useState, useEffect } from "react";
import {
  submitRequest,
  updateStatus,
  getAllRequests,
  type ArcRequest,
  type RequestType,
  type RequestStatus,
} from "@/services/arc";

const styles = {
  ink:       "#0E0E0C",
  paper:     "#F7F6F2",
  rule:      "#C8C3B8",
  rust:      "#C94C2E",
  inkLight:  "#7A7268",
  accent:    "#2563EB",
  serif:     "'Playfair Display', Georgia, serif",
  mono:      "'IBM Plex Mono', monospace",
  sans:      "'IBM Plex Sans', sans-serif",
};

const REQUEST_TYPES: { value: string; label: string }[] = [
  { value: "Fence",       label: "Fence" },
  { value: "Addition",    label: "Addition / Extension" },
  { value: "Roof",        label: "Roof Replacement" },
  { value: "Landscaping", label: "Landscaping" },
  { value: "Deck",        label: "Deck / Patio" },
  { value: "Siding",      label: "Siding" },
  { value: "Window",      label: "Windows / Doors" },
  { value: "Other",       label: "Other" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Pending:     { label: "Pending",      color: styles.inkLight },
  UnderReview: { label: "Under Review", color: "#B45309" },
  Approved:    { label: "Approved",     color: "#15803D" },
  Rejected:    { label: "Rejected",     color: styles.rust },
};

function statusKey(status: RequestStatus): string {
  return Object.keys(status)[0];
}

function requestTypeKey(rt: RequestType): string {
  return Object.keys(rt)[0];
}

export default function ArcPage() {
  const [requests,     setRequests]     = useState<ArcRequest[]>([]);
  const [selected,     setSelected]     = useState<ArcRequest | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [error,        setError]        = useState("");

  // submit form state
  const [unitId,       setUnitId]       = useState("");
  const [reqType,      setReqType]      = useState("Fence");
  const [description,  setDescription]  = useState("");
  const [photoHash,    setPhotoHash]    = useState("");
  const [submitting,   setSubmitting]   = useState(false);

  // review form state
  const [reviewStatus, setReviewStatus] = useState("Approved");
  const [reviewNotes,  setReviewNotes]  = useState("");
  const [reviewing,    setReviewing]    = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const all = await getAllRequests();
    setRequests(all.sort((alpha, beta) => Number(beta.createdAt - alpha.createdAt)));
  }

  async function handleSubmit(evt: React.FormEvent) {
    evt.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await submitRequest(
      unitId,
      { [reqType]: null } as RequestType,
      description,
      photoHash ? [photoHash] : []
    );
    setSubmitting(false);
    if ("err" in result) {
      setError(Object.values(result.err)[0] || "Submission failed");
      return;
    }
    setUnitId(""); setReqType("Fence"); setDescription(""); setPhotoHash("");
    setShowForm(false);
    await load();
    setSelected(result.ok);
  }

  async function handleReview(evt: React.FormEvent) {
    evt.preventDefault();
    if (!selected) return;
    setReviewing(true);
    const result = await updateStatus(
      selected.id,
      { [reviewStatus]: null } as RequestStatus,
      reviewNotes ? [reviewNotes] : []
    );
    setReviewing(false);
    if ("err" in result) return;
    await load();
    setSelected(result.ok);
    setReviewNotes("");
  }

  const sidebarWidth = 280;

  return (
    <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: sidebarWidth, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
          <h2 style={{ fontFamily: styles.serif, fontSize: "1.15rem", margin: 0, color: styles.ink }}>
            ARC Requests
          </h2>
          <button
            onClick={() => setShowForm(show => !show)}
            style={{
              fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
              textTransform: "uppercase", background: styles.accent, color: "#fff",
              border: "none", padding: "0.3rem 0.7rem", cursor: "pointer",
            }}
          >
            {showForm ? "Cancel" : "+ Submit"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: "1.5rem", padding: "1rem", border: `1px solid ${styles.rule}`, background: "#fff" }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, display: "block", marginBottom: "0.3rem" }}>Unit ID</label>
              <input value={unitId} onChange={evt => setUnitId(evt.target.value)} required
                style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: `1px solid ${styles.rule}`, fontFamily: styles.sans, fontSize: "0.85rem" }} />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, display: "block", marginBottom: "0.3rem" }}>Type</label>
              <select value={reqType} onChange={evt => setReqType(evt.target.value)}
                style={{ width: "100%", padding: "0.4rem", border: `1px solid ${styles.rule}`, fontFamily: styles.sans, fontSize: "0.85rem", background: "#fff" }}>
                {REQUEST_TYPES.map(rt => (
                  <option key={rt.value} value={rt.value}>{rt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, display: "block", marginBottom: "0.3rem" }}>Description</label>
              <textarea value={description} onChange={evt => setDescription(evt.target.value)} required rows={3}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: `1px solid ${styles.rule}`, fontFamily: styles.sans, fontSize: "0.85rem", resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, display: "block", marginBottom: "0.3rem" }}>Photo Hash (optional)</label>
              <input value={photoHash} onChange={evt => setPhotoHash(evt.target.value)} placeholder="sha256-..."
                style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.75rem" }} />
            </div>
            {error && <p style={{ color: styles.rust, fontFamily: styles.mono, fontSize: "0.7rem", margin: "0 0 0.5rem" }}>{error}</p>}
            <button type="submit" disabled={submitting}
              style={{ width: "100%", padding: "0.5rem", background: styles.ink, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: submitting ? "wait" : "pointer" }}>
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {requests.length === 0 && (
            <p style={{ fontFamily: styles.mono, fontSize: "0.7rem", color: styles.inkLight }}>No requests yet.</p>
          )}
          {requests.map(req => {
            const sk = statusKey(req.status);
            const st = STATUS_LABELS[sk] ?? { label: sk, color: styles.inkLight };
            return (
              <button key={req.id} onClick={() => setSelected(req)}
                style={{
                  textAlign: "left", padding: "0.75rem", border: `1px solid ${selected?.id === req.id ? styles.accent : styles.rule}`,
                  background: selected?.id === req.id ? "#EFF6FF" : "#fff", cursor: "pointer",
                }}>
                <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                  {req.id} · {req.unitId}
                </div>
                <div style={{ fontFamily: styles.sans, fontSize: "0.85rem", color: styles.ink, marginBottom: "0.25rem" }}>
                  {REQUEST_TYPES.find(rt => rt.value === requestTypeKey(req.requestType))?.label ?? requestTypeKey(req.requestType)}
                </div>
                <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: st.color }}>
                  ● {st.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <div style={{ padding: "3rem 0", textAlign: "center" }}>
            <p style={{ fontFamily: styles.mono, fontSize: "0.7rem", color: styles.inkLight, letterSpacing: "0.06em" }}>
              SELECT A REQUEST TO VIEW DETAILS
            </p>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
              <h2 style={{ fontFamily: styles.serif, fontSize: "1.25rem", margin: 0, color: styles.ink }}>
                {REQUEST_TYPES.find(rt => rt.value === requestTypeKey(selected.requestType))?.label ?? requestTypeKey(selected.requestType)}
              </h2>
              <span style={{ fontFamily: styles.mono, fontSize: "0.65rem", color: styles.inkLight }}>{selected.id}</span>
            </div>

            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1.5rem" }}>
              <tbody>
                {[
                  ["Unit", selected.unitId],
                  ["Status", (() => { const sk = statusKey(selected.status); return (STATUS_LABELS[sk] ?? { label: sk }).label; })()],
                  ["Submitted by", selected.submittedBy.toText()],
                  ...(selected.reviewedBy.length > 0 ? [["Reviewed by", selected.reviewedBy[0]!.toText()]] : []),
                  ...(selected.reviewNotes.length > 0 ? [["Review notes", selected.reviewNotes[0]!]] : []),
                  ...(selected.photoHash.length > 0 ? [["Photo hash", selected.photoHash[0]!]] : []),
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: `1px solid ${styles.rule}` }}>
                    <td style={{ fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase", color: styles.inkLight, padding: "0.5rem 1rem 0.5rem 0", whiteSpace: "nowrap" }}>{label}</td>
                    <td style={{ fontFamily: styles.sans, fontSize: "0.9rem", color: styles.ink, padding: "0.5rem 0", wordBreak: "break-all" }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: "1rem", border: `1px solid ${styles.rule}` }}>
              <p style={{ fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, margin: "0 0 0.5rem" }}>Description</p>
              <p style={{ fontFamily: styles.sans, fontSize: "0.9rem", color: styles.ink, margin: 0, lineHeight: 1.6 }}>{selected.description}</p>
            </div>

            {/* Board review form */}
            <div style={{ marginTop: "1.5rem", borderTop: `1px solid ${styles.rule}`, paddingTop: "1.5rem" }}>
              <p style={{ fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, margin: "0 0 0.75rem" }}>Board Decision</p>
              <form onSubmit={handleReview} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {["UnderReview", "Approved", "Rejected"].map(statusOption => (
                    <label key={statusOption} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontFamily: styles.sans, fontSize: "0.85rem" }}>
                      <input type="radio" name="reviewStatus" value={statusOption}
                        checked={reviewStatus === statusOption}
                        onChange={evt => setReviewStatus(evt.target.value)} />
                      {STATUS_LABELS[statusOption]?.label ?? statusOption}
                    </label>
                  ))}
                </div>
                <textarea
                  placeholder="Review notes (optional)"
                  value={reviewNotes}
                  onChange={evt => setReviewNotes(evt.target.value)}
                  rows={2}
                  style={{ padding: "0.4rem", border: `1px solid ${styles.rule}`, fontFamily: styles.sans, fontSize: "0.85rem", resize: "vertical" }}
                />
                <button type="submit" disabled={reviewing}
                  style={{ alignSelf: "flex-start", padding: "0.4rem 1rem", background: styles.ink, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: reviewing ? "wait" : "pointer" }}>
                  {reviewing ? "Saving…" : "Save Decision"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

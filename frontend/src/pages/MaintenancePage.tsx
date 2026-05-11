import { useEffect, useState } from "react";
import {
  getMyRequests,
  getAllRequests,
  submitRequest,
  updateStatus,
  type MaintenanceRequest,
  type RequestCategory,
  type RequestStatus,
} from "@/services/maintenance";
import { useAuthStore } from "@/store/authStore";

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rust:     "#C94C2E",
  sage:     "#5A8C58",
  amber:    "#D4860A",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

const CATEGORIES: { value: RequestCategory; label: string }[] = [
  { value: { Plumbing: null },    label: "Plumbing"    },
  { value: { Electrical: null },  label: "Electrical"  },
  { value: { HVAC: null },        label: "HVAC"        },
  { value: { Structural: null },  label: "Structural"  },
  { value: { Landscaping: null }, label: "Landscaping" },
  { value: { Appliance: null },   label: "Appliance"   },
  { value: { Other: null },       label: "Other"       },
];

const STATUS_STEPS: { value: RequestStatus; label: string; color: string }[] = [
  { value: { Open: null },       label: "Open",        color: S.amber  },
  { value: { Assigned: null },   label: "Assigned",    color: S.navy   },
  { value: { InProgress: null }, label: "In Progress", color: S.ink    },
  { value: { Resolved: null },   label: "Resolved",    color: S.sage   },
  { value: { Closed: null },     label: "Closed",      color: S.inkLight },
];

function categoryLabel(cat: RequestCategory): string {
  const key = Object.keys(cat)[0];
  return CATEGORIES.find((c) => Object.keys(c.value)[0] === key)?.label ?? key;
}

function statusInfo(s: RequestStatus) {
  const key = Object.keys(s)[0];
  return STATUS_STEPS.find((x) => Object.keys(x.value)[0] === key) ?? STATUS_STEPS[0];
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.75rem",
  border: `1px solid ${S.rule}`,
  fontFamily: S.sans, fontSize: "0.875rem",
  outline: "none", boxSizing: "border-box",
};

export default function MaintenancePage() {
  const { principal } = useAuthStore();
  const [requests,   setRequests]   = useState<MaintenanceRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [unitId,     setUnitId]     = useState("");
  const [category,   setCategory]   = useState<RequestCategory>({ Plumbing: null });
  const [description, setDescription] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<"mine" | "all">("mine");

  useEffect(() => {
    const fetch = activeTab === "mine" ? getMyRequests : getAllRequests;
    setLoading(true);
    fetch().then(setRequests).catch(() => {}).finally(() => setLoading(false));
  }, [activeTab]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitRequest(unitId, category, description, []);
      if ("ok" in result) {
        setRequests((r) => [result.ok, ...r]);
        setShowForm(false);
        setUnitId(""); setDescription("");
      } else {
        const err = result.err;
        setSubmitError("NotAuthorized" in err ? "Members only." : "InvalidInput" in err ? err.InvalidInput : "Submit failed.");
      }
    } catch {
      setSubmitError("Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvance(req: MaintenanceRequest) {
    const statusKeys = STATUS_STEPS.map((s) => Object.keys(s.value)[0]);
    const currentKey = Object.keys(req.status)[0];
    const idx = statusKeys.indexOf(currentKey);
    if (idx < 0 || idx >= statusKeys.length - 1) return;
    const nextStatus = STATUS_STEPS[idx + 1].value;
    const result = await updateStatus(req.id, nextStatus, "Status updated");
    if ("ok" in result) {
      setRequests((rs) => rs.map((r) => r.id === req.id ? result.ok : r));
    }
  }

  const slaCount = requests.filter((r) => r.slaWarning).length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.4rem 1rem",
    background: active ? S.navy : "transparent",
    color: active ? "#fff" : S.inkLight,
    border: `1px solid ${active ? S.navy : S.rule}`,
    fontFamily: S.mono, fontSize: "0.62rem",
    letterSpacing: "0.1em", textTransform: "uppercase",
    cursor: "pointer",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Maintenance</h1>
          <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem" }}>
            Submit and track repair requests
            {slaCount > 0 && (
              <span style={{ marginLeft: "0.75rem", color: S.rust, fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.08em" }}>
                ⚠ {slaCount} PAST 7-DAY SLA
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ padding: "0.5rem 1rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showForm ? "Cancel" : "New Request"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Unit</label>
            <input style={inputStyle} value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="e.g. 42B" required />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Category</label>
            <select
              style={{ ...inputStyle, background: "#fff" }}
              value={Object.keys(category)[0]}
              onChange={(e) => setCategory(CATEGORIES.find((c) => Object.keys(c.value)[0] === e.target.value)!.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={Object.keys(c.value)[0]} value={Object.keys(c.value)[0]}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          {submitError && <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, margin: 0 }}>{submitError}</p>}
          <button type="submit" disabled={submitting} style={{ padding: "0.75rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: 0, marginBottom: "1.5rem" }}>
        <button style={tabStyle(activeTab === "mine")} onClick={() => setActiveTab("mine")}>My Requests</button>
        <button style={tabStyle(activeTab === "all")}  onClick={() => setActiveTab("all")}>All Requests</button>
      </div>

      {loading && <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading…</p>}

      {!loading && requests.length === 0 && (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO REQUESTS
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {requests.map((req) => {
          const si = statusInfo(req.status);
          const isOwn = req.submittedBy.toText() === principal;
          const statusKey = Object.keys(req.status)[0];
          const canAdvance = statusKey !== "Closed" && statusKey !== "Resolved";
          return (
            <div key={req.id} style={{ border: `1px solid ${req.slaWarning ? S.rust : S.rule}`, padding: "1.25rem 1.5rem", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  {req.slaWarning && (
                    <div style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.1em", color: S.rust, textTransform: "uppercase", marginBottom: "0.25rem" }}>⚠ SLA EXCEEDED</div>
                  )}
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.35rem" }}>
                    <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight, textTransform: "uppercase" }}>
                      {categoryLabel(req.category)}
                    </span>
                    <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: si.color, textTransform: "uppercase" }}>
                      {si.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "0.25rem" }}>{req.description}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.58rem", color: S.inkLight, letterSpacing: "0.05em" }}>
                    Unit {req.unitId} · {new Date(Number(req.createdAt) / 1_000_000).toLocaleDateString()}
                    {req.assignedVendorId.length > 0 && ` · Vendor: ${req.assignedVendorId[0]}`}
                  </div>
                </div>
                {canAdvance && (
                  <button
                    onClick={() => handleAdvance(req)}
                    style={{ background: "none", border: `1px solid ${S.rule}`, color: S.inkLight, fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", padding: "0.3rem 0.6rem", flexShrink: 0, marginLeft: "1rem" }}
                  >
                    Advance →
                  </button>
                )}
              </div>
              {req.history.length > 0 && (
                <div style={{ marginTop: "0.75rem", borderTop: `1px solid ${S.rule}`, paddingTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {req.history.slice(-2).map((entry, i) => (
                    <div key={i} style={{ fontFamily: S.mono, fontSize: "0.58rem", color: S.inkLight }}>
                      {Object.keys(entry.status)[0].toUpperCase()} — {entry.note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

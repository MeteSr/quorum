import { useEffect, useState } from "react";
import {
  addVendor,
  updateVendor,
  removeVendor,
  addVendorReview,
  logJob,
  updateCOI,
  getAllVendors,
  getJobsForVendor,
  getExpiringCOIs,
  type Vendor,
  type VendorCategory,
  type VendorJob,
} from "@/services/vendors";

const styles = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  rust:     "#C94C2E",
  sage:     "#5A8C58",
  amber:    "#D4860A",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

const CATEGORIES: { value: VendorCategory; label: string }[] = [
  { value: { Plumbing:    null }, label: "Plumbing"    },
  { value: { Electrical:  null }, label: "Electrical"  },
  { value: { Landscaping: null }, label: "Landscaping" },
  { value: { HVAC:        null }, label: "HVAC"        },
  { value: { Cleaning:    null }, label: "Cleaning"    },
  { value: { Roofing:     null }, label: "Roofing"     },
  { value: { Painting:    null }, label: "Painting"    },
  { value: { Other:       null }, label: "Other"       },
];

function categoryLabel(cat: VendorCategory): string {
  return CATEGORIES.find((c) => JSON.stringify(c.value) === JSON.stringify(cat))?.label ?? "Other";
}

function avgRating(vendor: Vendor): string {
  if (Number(vendor.reviewCount) === 0) return "—";
  return (Number(vendor.ratingSum) / Number(vendor.reviewCount)).toFixed(1);
}

function coiStatus(vendor: Vendor): { label: string; color: string } | null {
  if (vendor.coi.length === 0) return null;
  const expiryMs = Number(vendor.coi[0]!.expiryNs) / 1_000_000;
  const now      = Date.now();
  const daysLeft = Math.ceil((expiryMs - now) / 86_400_000);
  if (daysLeft < 0)  return { label: "COI EXPIRED",         color: styles.rust  };
  if (daysLeft <= 30) return { label: `COI EXP. ${daysLeft}D`, color: styles.amber };
  return { label: `COI VALID ${daysLeft}D`, color: styles.sage };
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${styles.rule}`,
  fontFamily: styles.sans, fontSize: "0.875rem", outline: "none",
  boxSizing: "border-box",
};

export default function VendorsPage() {
  const [vendors,      setVendors]     = useState<Vendor[]>([]);
  const [expiring,     setExpiring]    = useState<Vendor[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [showAdd,      setShowAdd]     = useState(false);
  const [submitting,   setSubmitting]  = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<string | null>(null);
  const [jobsCache,    setJobsCache]   = useState<Record<string, VendorJob[]>>({});

  // Add form
  const [name,     setName]     = useState("");
  const [category, setCategory] = useState<VendorCategory>({ Plumbing: null });
  const [phone,    setPhone]    = useState("");
  const [email,    setEmail]    = useState("");
  const [website,  setWebsite]  = useState("");
  const [notes,    setNotes]    = useState("");

  // COI modal
  const [coiVendorId, setCoiVendorId] = useState<string | null>(null);
  const [coiExpiry,   setCoiExpiry]   = useState("");

  // Quick review
  const [reviewVendorId, setReviewVendorId] = useState<string | null>(null);
  const [reviewStars,    setReviewStars]    = useState(5);

  // Log job modal
  const [jobVendorId, setJobVendorId] = useState<string | null>(null);
  const [jobDesc,     setJobDesc]     = useState("");
  const [jobCost,     setJobCost]     = useState("");
  const [jobNotes,    setJobNotes]    = useState("");

  useEffect(() => {
    Promise.all([
      getAllVendors().catch(() => [] as Vendor[]),
      getExpiringCOIs(60).catch(() => [] as Vendor[]),
    ]).then(([allVendors, expiringVendors]) => {
      setVendors(allVendors);
      setExpiring(expiringVendors);
    }).finally(() => setLoading(false));
  }, []);

  async function handleAddVendor(evt: React.FormEvent) {
    evt.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const result = await addVendor(name, category, phone, email, website, notes);
      if ("ok" in result) {
        setVendors((prev) => [result.ok, ...prev]);
        setShowAdd(false);
        setName(""); setPhone(""); setEmail(""); setWebsite(""); setNotes("");
      } else {
        const err = result.err;
        if ("InvalidInput" in err)  setError(err.InvalidInput);
        else if ("NotAuthorized" in err) setError("Not authorised.");
        else setError("Failed to add vendor.");
      }
    } catch { setError("Failed to add vendor."); }
    finally  { setSubmitting(false); }
  }

  async function handleRemove(vendorId: string) {
    const result = await removeVendor(vendorId);
    if ("ok" in result) setVendors((prev) => prev.filter((v) => v.id !== vendorId));
  }

  async function handleSubmitReview() {
    if (!reviewVendorId) return;
    const result = await addVendorReview(reviewVendorId, reviewStars);
    if ("ok" in result) {
      setVendors((prev) => prev.map((v) => v.id === reviewVendorId ? result.ok : v));
    }
    setReviewVendorId(null);
  }

  async function handleUpdateCOI() {
    if (!coiVendorId || !coiExpiry) return;
    const expiryNs = BigInt(new Date(coiExpiry).getTime()) * BigInt(1_000_000);
    const result = await updateCOI(coiVendorId, [], expiryNs);
    if ("ok" in result) {
      setVendors((prev) => prev.map((v) => v.id === coiVendorId ? result.ok : v));
      const refreshed = await getExpiringCOIs(60).catch(() => [] as Vendor[]);
      setExpiring(refreshed);
    }
    setCoiVendorId(null); setCoiExpiry("");
  }

  async function handleLogJob() {
    if (!jobVendorId || !jobDesc.trim()) return;
    const costBigInt: [] | [bigint] = jobCost ? [BigInt(Math.round(parseFloat(jobCost) * 100))] : [];
    const result = await logJob(jobVendorId, jobDesc, [], costBigInt, jobNotes);
    if ("ok" in result) {
      setVendors((prev) => prev.map((v) => v.id === jobVendorId
        ? { ...v, jobCount: v.jobCount + BigInt(1) }
        : v));
      setJobsCache((prev) => ({
        ...prev,
        [jobVendorId]: [...(prev[jobVendorId] ?? []), result.ok],
      }));
    }
    setJobVendorId(null); setJobDesc(""); setJobCost(""); setJobNotes("");
  }

  async function handleExpandJobs(vendorId: string) {
    if (expandedJobs === vendorId) { setExpandedJobs(null); return; }
    if (!jobsCache[vendorId]) {
      const jobs = await getJobsForVendor(vendorId).catch(() => [] as VendorJob[]);
      setJobsCache((prev) => ({ ...prev, [vendorId]: jobs }));
    }
    setExpandedJobs(vendorId);
  }

  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: styles.mono, fontSize: "0.6rem",
    letterSpacing: "0.1em", textTransform: "uppercase", color: styles.inkLight,
    marginBottom: "0.3rem",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: styles.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Vendors</h1>
          <p style={{ color: styles.inkLight, fontFamily: styles.sans, fontSize: "0.9rem" }}>
            Approved service providers, job history, and certificate-of-insurance tracking
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "0.5rem 1rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showAdd ? "Cancel" : "Add Vendor"}
        </button>
      </div>

      {/* COI alert banner */}
      {expiring.length > 0 && (
        <div style={{ padding: "0.75rem 1.25rem", background: "#FFFBEB", border: `1px solid ${styles.amber}`, marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: styles.sans, fontSize: "0.875rem", color: styles.amber }}>
            ⚠ {expiring.length} vendor{expiring.length !== 1 ? "s" : ""} with COI expiring within 60 days
          </span>
          <span style={{ fontFamily: styles.mono, fontSize: "0.58rem", color: styles.inkLight, letterSpacing: "0.06em" }}>
            {expiring.map((v) => v.name).join(", ")}
          </span>
        </div>
      )}

      {/* Add vendor form */}
      {showAdd && (
        <form onSubmit={handleAddVendor} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Company name</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={{ ...inputStyle, background: "#fff" }} value={JSON.stringify(category)} onChange={(e) => setCategory(JSON.parse(e.target.value))}>
                {CATEGORIES.map((c) => <option key={JSON.stringify(c.value)} value={JSON.stringify(c.value)}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input style={inputStyle} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.rust, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ padding: "0.75rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {submitting ? "Adding…" : "Add Vendor"}
          </button>
        </form>
      )}

      {loading && <p style={{ fontFamily: styles.sans, color: styles.inkLight }}>Loading vendors…</p>}

      {!loading && vendors.length === 0 && (
        <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO VENDORS ADDED
        </div>
      )}

      {/* Vendor list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {vendors.map((vendor) => {
          const coi      = coiStatus(vendor);
          const expanded = expandedJobs === vendor.id;
          return (
            <div key={vendor.id} style={{ border: `1px solid ${styles.rule}`, background: "#fff" }}>
              <div style={{ padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: styles.inkLight, textTransform: "uppercase" }}>
                      {categoryLabel(vendor.category)}
                    </span>
                    {coi && (
                      <span style={{ fontFamily: styles.mono, fontSize: "0.55rem", color: coi.color, border: `1px solid ${coi.color}`, padding: "0.1rem 0.35rem" }}>
                        {coi.label}
                      </span>
                    )}
                    {vendor.coi.length === 0 && (
                      <span style={{ fontFamily: styles.mono, fontSize: "0.55rem", color: styles.inkLight, border: `1px solid ${styles.rule}`, padding: "0.1rem 0.35rem" }}>
                        NO COI
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: styles.sans, fontWeight: 500, fontSize: "1rem" }}>{vendor.name}</div>
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.35rem" }}>
                    {vendor.phone && <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight }}>{vendor.phone}</span>}
                    {vendor.email && <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight }}>{vendor.email}</span>}
                  </div>
                  {vendor.notes && (
                    <div style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight, marginTop: "0.3rem" }}>{vendor.notes}</div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem" }}>
                  <div style={{ textAlign: "right", fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight }}>
                    <div>★ {avgRating(vendor)} ({Number(vendor.reviewCount)} reviews)</div>
                    <div style={{ marginTop: "0.15rem" }}>{Number(vendor.jobCount)} jobs</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => { setReviewVendorId(vendor.id); setReviewStars(5); }}
                      style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}>
                      Review
                    </button>
                    <button onClick={() => handleExpandJobs(vendor.id)}
                      style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.navy }}>
                      {expanded ? "Hide Jobs" : `Jobs (${Number(vendor.jobCount)})`}
                    </button>
                    <button onClick={() => { setJobVendorId(vendor.id); setJobDesc(""); setJobCost(""); setJobNotes(""); }}
                      style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}>
                      Log Job
                    </button>
                    <button onClick={() => { setCoiVendorId(vendor.id); setCoiExpiry(""); }}
                      style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}>
                      Update COI
                    </button>
                    <button onClick={() => handleRemove(vendor.id)}
                      style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rust}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.rust }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Job history */}
              {expanded && (
                <div style={{ borderTop: `1px solid ${styles.rule}`, padding: "1rem 1.5rem" }}>
                  <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: styles.inkLight, marginBottom: "0.75rem" }}>
                    Job History
                  </div>
                  {(jobsCache[vendor.id] ?? []).length === 0 ? (
                    <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight, margin: 0 }}>No jobs logged yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {(jobsCache[vendor.id] ?? []).map((job) => (
                        <div key={job.id} style={{ display: "flex", justifyContent: "space-between", fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight }}>
                          <span style={{ maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.description}</span>
                          <span>{job.costCents.length > 0 ? `$${(Number(job.costCents[0]) / 100).toFixed(2)}` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Review modal */}
      {reviewVendorId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", border: `1px solid ${styles.rule}`, padding: "2rem", width: 340, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ fontFamily: styles.serif, fontSize: "1.2rem", fontWeight: 700 }}>Leave a Review</div>
            <div>
              <label style={labelStyle}>Stars (1–5)</label>
              <select style={{ ...inputStyle, background: "#fff" }} value={reviewStars} onChange={(e) => setReviewStars(Number(e.target.value))}>
                {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} star{n !== 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setReviewVendorId(null)} style={{ padding: "0.4rem 0.9rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSubmitReview} style={{ padding: "0.4rem 0.9rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", cursor: "pointer" }}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Update COI modal */}
      {coiVendorId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", border: `1px solid ${styles.rule}`, padding: "2rem", width: 360, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ fontFamily: styles.serif, fontSize: "1.2rem", fontWeight: 700 }}>Update Certificate of Insurance</div>
            <div>
              <label style={labelStyle}>COI Expiry Date</label>
              <input type="date" style={{ ...inputStyle, background: "#fff" }} value={coiExpiry} onChange={(e) => setCoiExpiry(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setCoiVendorId(null)} style={{ padding: "0.4rem 0.9rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleUpdateCOI} style={{ padding: "0.4rem 0.9rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Log job modal */}
      {jobVendorId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", border: `1px solid ${styles.rule}`, padding: "2rem", width: 400, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ fontFamily: styles.serif, fontSize: "1.2rem", fontWeight: 700 }}>Log Job</div>
            <div>
              <label style={labelStyle}>Description</label>
              <input style={inputStyle} value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Cost ($)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} value={jobCost} onChange={(e) => setJobCost(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setJobVendorId(null)} style={{ padding: "0.4rem 0.9rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleLogJob} style={{ padding: "0.4rem 0.9rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", cursor: "pointer" }}>Log Job</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

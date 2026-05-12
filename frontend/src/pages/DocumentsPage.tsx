import { useEffect, useRef, useState } from "react";
import {
  getAllPublicDocumentsMeta,
  uploadDocument,
  acknowledgeDocument,
  getAcknowledgmentStatus,
  setRequiresAcknowledgment,
  getMyAcknowledgedDocs,
  setDocumentCompliance,
  clearDocumentCompliance,
  logDocumentAccess,
  getAccessLog,
  getComplianceStatus,
  type DocumentMeta,
  type DocCategory,
  type DocumentStatute,
  type AccessLogEntry,
  type ComplianceStatus,
} from "@/services/documents";

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

const CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: { GoverningDocuments: null }, label: "Governing Documents" },
  { value: { MeetingMinutes:     null }, label: "Meeting Minutes"     },
  { value: { FinancialReports:   null }, label: "Financial Reports"   },
  { value: { Notices:            null }, label: "Notices"             },
  { value: { Contracts:          null }, label: "Contracts"           },
  { value: { Other:              null }, label: "Other"               },
];

const STATUTES: { value: DocumentStatute; label: string; description: string }[] = [
  { value: { FLhb1203_Declaration: null }, label: "Declaration",         description: "Declaration of Covenants / CC&Rs" },
  { value: { FLhb1203_Bylaws:      null }, label: "Bylaws",              description: "Association Bylaws" },
  { value: { FLhb1203_Rules:       null }, label: "Rules",               description: "Rules & Regulations" },
  { value: { FLhb1203_Budget:      null }, label: "Annual Budget",       description: "Current Annual Budget" },
  { value: { FLhb1203_Minutes:     null }, label: "Meeting Minutes",     description: "Meeting Minutes (last 7 years)" },
  { value: { FLhb1203_Financial:   null }, label: "Financial Statements",description: "Financial Statements (last 3 years)" },
];

function categoryLabel(cat: DocCategory): string {
  return CATEGORIES.find((c) => JSON.stringify(c.value) === JSON.stringify(cat))?.label ?? "Other";
}

function statuteLabel(s: DocumentStatute): string {
  return STATUTES.find((st) => JSON.stringify(st.value) === JSON.stringify(s))?.label ?? "Unknown";
}

function formatBytes(bytes: bigint): string {
  const n = Number(bytes);
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Compliance Panel ─────────────────────────────────────────────────────────

function CompliancePanel({ status }: { status: ComplianceStatus | null }) {
  if (!status) return null;
  const { covered, missing } = status;
  if (covered.length === 0 && missing.length === 0) return null;

  function exportPdf() {
    const lines: string[] = [
      "FL HB 1203 Compliance Report",
      new Date().toLocaleDateString(),
      "",
      "COVERED (" + covered.length + "/" + STATUTES.length + "):",
      ...covered.map(s => "  [x] " + statuteLabel(s)),
      "",
      "MISSING (" + missing.length + "/" + STATUTES.length + "):",
      ...missing.map(s => "  [ ] " + statuteLabel(s)),
      "",
      "Note: ICP-certified access log available per document.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "fl-hb1203-compliance-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ border: `1px solid ${styles.rule}`, background: "white", marginBottom: "1.5rem" }}>
      <div style={{
        padding: "0.75rem 1.25rem",
        borderBottom: `1px solid ${styles.rule}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: missing.length === 0 ? "#F0FDF4" : "#FEF3C7",
      }}>
        <div>
          <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: missing.length === 0 ? styles.sage : styles.amber }}>
            FL HB 1203 Compliance — {covered.length}/{STATUTES.length} requirements met
          </span>
          {missing.length > 0 && (
            <span style={{ fontFamily: styles.sans, fontSize: "0.78rem", color: styles.amber, marginLeft: "0.75rem" }}>
              Missing {missing.length} required document{missing.length > 1 ? "s" : ""} — boards face $500/day fines
            </span>
          )}
        </div>
        <button
          onClick={exportPdf}
          style={{
            background: "none", border: `1px solid ${styles.rule}`,
            fontFamily: styles.mono, fontSize: "0.56rem", letterSpacing: "0.08em",
            textTransform: "uppercase", padding: "0.25rem 0.6rem", cursor: "pointer",
            color: styles.inkLight,
          }}
        >
          Export report
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 0 }}>
        {STATUTES.map(({ value, label, description }) => {
          const isCovered = covered.some(c => JSON.stringify(c) === JSON.stringify(value));
          return (
            <div key={label} style={{ padding: "0.75rem 1.25rem", borderRight: `1px solid ${styles.rule}`, borderBottom: `1px solid ${styles.rule}` }}>
              <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: isCovered ? styles.sage : styles.rust, marginBottom: 4 }}>
                {isCovered ? "✓" : "✗"} {label}
              </div>
              <div style={{ fontFamily: styles.sans, fontSize: "0.75rem", color: styles.inkLight }}>
                {description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Access Log Panel ─────────────────────────────────────────────────────────

function AccessLogPanel({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<AccessLogEntry[] | null>(null);

  useEffect(() => {
    getAccessLog(docId).then(setEntries);
  }, [docId]);

  return (
    <div style={{ borderTop: `1px solid ${styles.rule}`, padding: "1rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: styles.inkLight }}>
          Certified Access Log — {entries?.length ?? "…"} entries
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontFamily: styles.mono, fontSize: "0.56rem", color: styles.inkLight, cursor: "pointer", textTransform: "uppercase" }}>
          Hide
        </button>
      </div>
      {entries === null && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight }}>Loading…</p>}
      {entries?.length === 0 && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight }}>No access events recorded yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: 200, overflowY: "auto" }}>
        {entries?.map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: styles.mono, fontSize: "0.58rem", color: styles.inkLight }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
              {e.accessor.toText()}
            </span>
            <span>{new Date(Number(e.accessedAt) / 1_000_000).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DocumentsPage ────────────────────────────────────────────────────────────

type Tab = "documents" | "compliance";

export default function DocumentsPage() {
  const [tab,          setTab]          = useState<Tab>("documents");
  const [docs,         setDocs]         = useState<DocumentMeta[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [showUpload,   setShowUpload]   = useState(false);
  const [title,        setTitle]        = useState("");
  const [description,  setDescription] = useState("");
  const [category,     setCategory]    = useState<DocCategory>({ GoverningDocuments: null });
  const [myAckedDocs,  setMyAckedDocs]  = useState<string[]>([]);
  const [ackStatus,    setAckStatus]    = useState<Record<string, [string, bigint][]>>({});
  const [ackLoading,   setAckLoading]   = useState<string | null>(null);
  const [showAccessLog, setShowAccessLog] = useState<string | null>(null);
  const [compliance,   setCompliance]   = useState<ComplianceStatus | null>(null);
  // compliancePanel: docId → open/closed for per-doc statute picker
  const [statutePicker, setStatutePicker] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getAllPublicDocumentsMeta().catch(() => [] as DocumentMeta[]),
      getMyAcknowledgedDocs().catch(() => [] as string[]),
      getComplianceStatus().catch(() => null as ComplianceStatus | null),
    ]).then(([fetchedDocs, myAcked, compStatus]) => {
      setDocs(fetchedDocs);
      setMyAckedDocs(myAcked);
      setCompliance(compStatus);
    }).finally(() => setLoading(false));
  }, []);

  async function handleUpload(evt: React.FormEvent) {
    evt.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await uploadDocument(title, category, { AllMembers: null }, new Uint8Array(buffer), file.type, description);
      if ("ok" in result) {
        setDocs((prev) => [result.ok, ...prev]);
        setShowUpload(false);
        setTitle(""); setDescription("");
      } else {
        const err = result.err;
        if ("TooLarge"       in err) setUploadError(`File too large: ${err.TooLarge}`);
        else if ("NotAuthorized" in err) setUploadError("You are not authorised to upload documents.");
        else if ("InvalidInput"  in err) setUploadError(err.InvalidInput);
        else setUploadError("Upload failed.");
      }
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAcknowledge(docId: string) {
    setAckLoading(docId);
    try {
      const result = await acknowledgeDocument(docId);
      if ("ok" in result) setMyAckedDocs((prev) => prev.includes(docId) ? prev : [...prev, docId]);
    } finally {
      setAckLoading(null);
    }
  }

  async function handleViewAcks(docId: string) {
    if (ackStatus[docId]) {
      setAckStatus((prev) => { const next = { ...prev }; delete next[docId]; return next; });
      return;
    }
    const status = await getAcknowledgmentStatus(docId);
    setAckStatus((prev) => ({ ...prev, [docId]: status }));
  }

  async function handleToggleAckRequired(docId: string, current: boolean) {
    const result = await setRequiresAcknowledgment(docId, !current);
    if ("ok" in result) {
      setDocs((prev) => prev.map((doc) => doc.id === docId ? { ...doc, requiresAcknowledgment: !current } : doc));
    }
  }

  async function handleDownload(doc: DocumentMeta) {
    // Log access first (fire and forget — don't block download on error)
    logDocumentAccess(doc.id).catch(() => {});
    // Fetch full document and trigger browser download
    const anchor = document.createElement("a");
    anchor.href = `data:${doc.mimeType};base64,placeholder`;
    anchor.download = doc.title;
    anchor.click();
  }

  async function handleSetStatute(docId: string, statute: DocumentStatute) {
    const result = await setDocumentCompliance(docId, statute);
    if ("ok" in result) {
      setDocs(prev => prev.map(d => d.id === docId ? result.ok : d));
      setStatutePicker(null);
      // Refresh compliance status
      getComplianceStatus().then(setCompliance).catch(() => {});
    }
  }

  async function handleClearStatute(docId: string) {
    const result = await clearDocumentCompliance(docId);
    if ("ok" in result) {
      setDocs(prev => prev.map(d => d.id === docId ? result.ok : d));
      getComplianceStatus().then(setCompliance).catch(() => {});
    }
  }

  const inputStyle = {
    width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${styles.rule}`,
    fontFamily: styles.sans, fontSize: "0.875rem", outline: "none",
    boxSizing: "border-box" as const,
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "documents",  label: "Documents"  },
    { key: "compliance", label: "FL HB 1203" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontFamily: styles.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Documents</h1>
          <p style={{ color: styles.inkLight, fontFamily: styles.sans, fontSize: "0.9rem" }}>CC&Rs, bylaws, meeting minutes, and financial reports</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          style={{ padding: "0.5rem 1rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showUpload ? "Cancel" : "Upload"}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "2rem", borderBottom: `1px solid ${styles.rule}`, marginBottom: "1.5rem" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none", border: "none",
              fontFamily: styles.mono, fontSize: "0.62rem", letterSpacing: "0.1em",
              textTransform: "uppercase", cursor: "pointer",
              color: tab === t.key ? styles.ink : styles.inkLight,
              borderBottom: tab === t.key ? `2px solid ${styles.ink}` : "2px solid transparent",
              padding: "0 0 0.6rem", marginBottom: -1,
            }}
          >
            {t.label}
            {t.key === "compliance" && compliance?.missing && compliance.missing.length > 0 && (
              <span style={{ marginLeft: 6, background: styles.rust, color: "white", fontFamily: styles.mono, fontSize: "0.52rem", padding: "0.1rem 0.35rem" }}>
                {compliance.missing.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Compliance tab ── */}
      {tab === "compliance" && (
        <div>
          {compliance && (
            <div>
              <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: styles.inkLight, marginBottom: "1rem" }}>
                FL HB 1203 (2024) — Online Portal Requirements
              </div>
              <p style={{ fontFamily: styles.sans, fontSize: "0.88rem", color: styles.inkLight, marginBottom: "1.5rem", maxWidth: 600 }}>
                Florida HB 1203 requires HOAs to maintain an online portal with these governing documents. Non-compliance exposes boards to $500/day fines. Tag documents below to satisfy each requirement.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2rem" }}>
                {STATUTES.map(({ value, label, description }) => {
                  const isCovered = compliance.covered.some(c => JSON.stringify(c) === JSON.stringify(value));
                  const taggedDoc = docs.find(d => d.statute.length > 0 && JSON.stringify(d.statute[0]) === JSON.stringify(value));
                  return (
                    <div key={label} style={{ border: `1px solid ${isCovered ? styles.sage : styles.rust}`, padding: "0.9rem 1.25rem", background: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: isCovered ? styles.sage : styles.rust, marginBottom: 3 }}>
                          {isCovered ? "✓ Satisfied" : "✗ Missing"} — {label}
                        </div>
                        <div style={{ fontFamily: styles.sans, fontSize: "0.82rem", color: styles.inkLight }}>{description}</div>
                        {taggedDoc && (
                          <div style={{ fontFamily: styles.sans, fontSize: "0.78rem", color: styles.ink, marginTop: 4 }}>
                            Linked: <strong>{taggedDoc.title}</strong>
                          </div>
                        )}
                      </div>
                      {isCovered && taggedDoc && (
                        <button
                          onClick={() => handleClearStatute(taggedDoc.id)}
                          style={{ background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.25rem 0.5rem", cursor: "pointer", color: styles.inkLight }}
                        >
                          Unlink
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: styles.inkLight, marginBottom: "0.75rem" }}>
                Tag documents to requirements
              </div>
              <p style={{ fontFamily: styles.sans, fontSize: "0.82rem", color: styles.inkLight, marginBottom: "1rem" }}>
                Use the "Tag statute" button on any document in the Documents tab to link it to a statutory requirement.
              </p>
            </div>
          )}
          {!compliance && <p style={{ fontFamily: styles.sans, color: styles.inkLight }}>Loading compliance status…</p>}
        </div>
      )}

      {/* ── Documents tab ── */}
      {tab === "documents" && (
        <div>
          {/* Compliance summary bar */}
          {compliance && compliance.missing.length > 0 && (
            <CompliancePanel status={compliance} />
          )}

          {showUpload && (
            <form onSubmit={handleUpload} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Title</label>
                  <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Category</label>
                  <select style={{ ...inputStyle, background: "#fff" }} value={JSON.stringify(category)} onChange={(e) => setCategory(JSON.parse(e.target.value))}>
                    {CATEGORIES.map((c) => <option key={JSON.stringify(c.value)} value={JSON.stringify(c.value)}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Description</label>
                <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>File</label>
                <input ref={fileRef} type="file" required style={{ fontFamily: styles.sans, fontSize: "0.875rem" }} />
              </div>
              {uploadError && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.rust, margin: 0 }}>{uploadError}</p>}
              <button type="submit" disabled={uploading} style={{ padding: "0.75rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
                {uploading ? "Uploading…" : "Upload Document"}
              </button>
            </form>
          )}

          {loading && <p style={{ fontFamily: styles.sans, color: styles.inkLight }}>Loading documents…</p>}

          {!loading && docs.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO DOCUMENTS UPLOADED
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {docs.map((doc) => {
              const alreadyAcked = myAckedDocs.includes(doc.id);
              const hasStatute   = doc.statute.length > 0;
              return (
                <div key={doc.id} style={{ border: `1px solid ${styles.rule}`, background: "#fff" }}>
                  {/* Acknowledgment banner */}
                  {doc.requiresAcknowledgment && !alreadyAcked && (
                    <div style={{ padding: "0.6rem 1.5rem", background: "#FEF3C7", borderBottom: `1px solid ${styles.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: styles.sans, fontSize: "0.8rem" }}>
                        ⚠ This document requires your acknowledgment.
                      </span>
                      <button
                        disabled={ackLoading === doc.id}
                        onClick={() => handleAcknowledge(doc.id)}
                        style={{ padding: "0.3rem 0.75rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
                      >
                        {ackLoading === doc.id ? "…" : "Acknowledge"}
                      </button>
                    </div>
                  )}
                  {doc.requiresAcknowledgment && alreadyAcked && (
                    <div style={{ padding: "0.5rem 1.5rem", background: "#F0FDF4", borderBottom: `1px solid ${styles.rule}` }}>
                      <span style={{ fontFamily: styles.mono, fontSize: "0.58rem", color: styles.sage, letterSpacing: "0.08em" }}>✓ ACKNOWLEDGED</span>
                    </div>
                  )}

                  <div style={{ padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: styles.inkLight, textTransform: "uppercase", marginBottom: "0.25rem", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span>{categoryLabel(doc.category)}</span>
                        {doc.requiresAcknowledgment && (
                          <span style={{ color: styles.amber, padding: "0.1rem 0.35rem", border: `1px solid ${styles.amber}`, fontSize: "0.55rem" }}>ACK REQUIRED</span>
                        )}
                        {hasStatute && (
                          <span style={{ color: styles.sage, padding: "0.1rem 0.35rem", border: `1px solid ${styles.sage}`, fontSize: "0.55rem" }}>
                            FL HB 1203 — {statuteLabel(doc.statute[0]!)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: styles.sans, fontWeight: 500, fontSize: "0.95rem" }}>{doc.title}</div>
                      {doc.description && <div style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight, marginTop: "0.2rem" }}>{doc.description}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem", flexShrink: 0 }}>
                      <div style={{ textAlign: "right", fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, letterSpacing: "0.06em" }}>
                        <div>{formatBytes(doc.sizeBytes)}</div>
                        <div style={{ marginTop: "0.2rem" }}>{doc.mimeType}</div>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => handleDownload(doc)}
                          style={{ padding: "0.2rem 0.5rem", background: styles.navy, color: "white", border: "none", fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}
                        >
                          Download
                        </button>
                        <button
                          onClick={() => setStatutePicker(statutePicker === doc.id ? null : doc.id)}
                          style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}
                        >
                          Tag statute
                        </button>
                        <button
                          onClick={() => handleToggleAckRequired(doc.id, doc.requiresAcknowledgment)}
                          style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}
                        >
                          {doc.requiresAcknowledgment ? "Unmark Req." : "Require Ack"}
                        </button>
                        {doc.requiresAcknowledgment && (
                          <button
                            onClick={() => handleViewAcks(doc.id)}
                            style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.navy }}
                          >
                            {ackStatus[doc.id] ? "Hide Acks" : "View Acks"}
                          </button>
                        )}
                        <button
                          onClick={() => setShowAccessLog(showAccessLog === doc.id ? null : doc.id)}
                          style={{ padding: "0.2rem 0.5rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}
                        >
                          {showAccessLog === doc.id ? "Hide Log" : "Access Log"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Statute picker */}
                  {statutePicker === doc.id && (
                    <div style={{ borderTop: `1px solid ${styles.rule}`, padding: "0.75rem 1.5rem", background: "#FAFAF8" }}>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", color: styles.inkLight, marginBottom: 8 }}>
                        Tag as FL HB 1203 requirement
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {STATUTES.map(({ value, label }) => (
                          <button
                            key={label}
                            onClick={() => handleSetStatute(doc.id, value)}
                            style={{
                              background: "none",
                              border: `1px solid ${JSON.stringify(doc.statute[0]) === JSON.stringify(value) ? styles.sage : styles.rule}`,
                              color:  JSON.stringify(doc.statute[0]) === JSON.stringify(value) ? styles.sage : styles.inkLight,
                              fontFamily: styles.mono, fontSize: "0.56rem", letterSpacing: "0.06em",
                              textTransform: "uppercase", padding: "0.25rem 0.5rem", cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        ))}
                        {hasStatute && (
                          <button
                            onClick={() => handleClearStatute(doc.id)}
                            style={{ background: "none", border: `1px solid ${styles.rust}`, color: styles.rust, fontFamily: styles.mono, fontSize: "0.56rem", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0.25rem 0.5rem", cursor: "pointer" }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Acknowledgment dashboard */}
                  {ackStatus[doc.id] && (
                    <div style={{ borderTop: `1px solid ${styles.rule}`, padding: "1rem 1.5rem" }}>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: styles.inkLight, marginBottom: "0.75rem" }}>
                        Acknowledgments — {ackStatus[doc.id].length} member{ackStatus[doc.id].length !== 1 ? "s" : ""}
                      </div>
                      {ackStatus[doc.id].length === 0 && (
                        <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight, margin: 0 }}>No acknowledgments yet.</p>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {ackStatus[doc.id].map(([principal, ts], idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, letterSpacing: "0.04em" }}>
                            <span style={{ maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{principal}</span>
                            <span>{new Date(Number(ts) / 1_000_000).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certified access log */}
                  {showAccessLog === doc.id && (
                    <AccessLogPanel docId={doc.id} onClose={() => setShowAccessLog(null)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

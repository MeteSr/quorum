import { useEffect, useRef, useState } from "react";
import {
  getAllPublicDocumentsMeta,
  uploadDocument,
  acknowledgeDocument,
  getAcknowledgmentStatus,
  setRequiresAcknowledgment,
  getMyAcknowledgedDocs,
  type DocumentMeta,
  type DocCategory,
} from "@/services/documents";

const styles = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  rust:     "#C94C2E",
  sage:     "#5A8C58",
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

function categoryLabel(cat: DocCategory): string {
  return CATEGORIES.find((c) => JSON.stringify(c.value) === JSON.stringify(cat))?.label ?? "Other";
}

function formatBytes(bytes: bigint): string {
  const n = Number(bytes);
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [docs,         setDocs]          = useState<DocumentMeta[]>([]);
  const [loading,      setLoading]       = useState(true);
  const [uploading,    setUploading]     = useState(false);
  const [uploadError,  setUploadError]   = useState<string | null>(null);
  const [showUpload,   setShowUpload]    = useState(false);
  const [title,        setTitle]         = useState("");
  const [description,  setDescription]  = useState("");
  const [category,     setCategory]      = useState<DocCategory>({ GoverningDocuments: null });
  const [myAckedDocs,  setMyAckedDocs]   = useState<string[]>([]);
  // ackStatus: docId → [(principalText, timestamp)]
  const [ackStatus,    setAckStatus]     = useState<Record<string, [string, bigint][]>>({});
  const [ackLoading,   setAckLoading]    = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getAllPublicDocumentsMeta().catch(() => [] as DocumentMeta[]),
      getMyAcknowledgedDocs().catch(() => [] as string[]),
    ]).then(([fetchedDocs, myAcked]) => {
      setDocs(fetchedDocs);
      setMyAckedDocs(myAcked);
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
        if ("TooLarge"    in err) setUploadError(`File too large: ${err.TooLarge}`);
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
      if ("ok" in result) {
        setMyAckedDocs((prev) => prev.includes(docId) ? prev : [...prev, docId]);
      }
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

  const inputStyle = {
    width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${styles.rule}`,
    fontFamily: styles.sans, fontSize: "0.875rem", outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
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

      {showUpload && (
        <form onSubmit={handleUpload} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Title</label>
              <input style={inputStyle} value={title} onChange={(evt) => setTitle(evt.target.value)} required />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Category</label>
              <select style={{ ...inputStyle, background: "#fff" }} value={JSON.stringify(category)} onChange={(evt) => setCategory(JSON.parse(evt.target.value))}>
                {CATEGORIES.map((c) => <option key={JSON.stringify(c.value)} value={JSON.stringify(c.value)}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Description</label>
            <input style={inputStyle} value={description} onChange={(evt) => setDescription(evt.target.value)} />
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

              <div style={{ padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: styles.inkLight, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    {categoryLabel(doc.category)}
                    {doc.requiresAcknowledgment && (
                      <span style={{ marginLeft: "0.5rem", color: "#D4860A", padding: "0.1rem 0.35rem", border: "1px solid #D4860A", fontSize: "0.55rem" }}>ACK REQUIRED</span>
                    )}
                  </div>
                  <div style={{ fontFamily: styles.sans, fontWeight: 500, fontSize: "0.95rem" }}>{doc.title}</div>
                  {doc.description && <div style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.inkLight, marginTop: "0.2rem" }}>{doc.description}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem" }}>
                  <div style={{ textAlign: "right", fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, letterSpacing: "0.06em" }}>
                    <div>{formatBytes(doc.sizeBytes)}</div>
                    <div style={{ marginTop: "0.2rem" }}>{doc.mimeType}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
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
                        {ackStatus[doc.id] ? "Hide" : "View Acks"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

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
            </div>
          );
        })}
      </div>
    </div>
  );
}

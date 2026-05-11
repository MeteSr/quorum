import { useEffect, useRef, useState } from "react";
import { getAllPublicDocumentsMeta, uploadDocument, type DocumentMeta, type DocCategory } from "@/services/documents";

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  rust:     "#C94C2E",
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
  const [docs,         setDocs]        = useState<DocumentMeta[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [uploading,    setUploading]   = useState(false);
  const [uploadError,  setUploadError] = useState<string | null>(null);
  const [showUpload,   setShowUpload]  = useState(false);
  const [title,        setTitle]       = useState("");
  const [description,  setDescription] = useState("");
  const [category,     setCategory]    = useState<DocCategory>({ GoverningDocuments: null });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllPublicDocumentsMeta().then(setDocs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await uploadDocument(title, category, { AllMembers: null }, new Uint8Array(buffer), file.type, description);
      if ("ok" in result) {
        setDocs((d) => [result.ok, ...d]);
        setShowUpload(false);
        setTitle(""); setDescription("");
      } else {
        const err = result.err;
        if ("TooLarge"     in err) setUploadError(`File too large: ${err.TooLarge}`);
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

  const inputStyle = { width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.sans, fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Documents</h1>
          <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem" }}>CC&Rs, bylaws, meeting minutes, and financial reports</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          style={{ padding: "0.5rem 1rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showUpload ? "Cancel" : "Upload"}
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Title</label>
              <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Category</label>
              <select style={{ ...inputStyle, background: "#fff" }} value={JSON.stringify(category)} onChange={(e) => setCategory(JSON.parse(e.target.value))}>
                {CATEGORIES.map((c) => <option key={JSON.stringify(c.value)} value={JSON.stringify(c.value)}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>Description</label>
            <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: S.inkLight, marginBottom: "0.3rem" }}>File</label>
            <input ref={fileRef} type="file" required style={{ fontFamily: S.sans, fontSize: "0.875rem" }} />
          </div>
          {uploadError && <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, margin: 0 }}>{uploadError}</p>}
          <button type="submit" disabled={uploading} style={{ padding: "0.75rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {uploading ? "Uploading…" : "Upload Document"}
          </button>
        </form>
      )}

      {loading && <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading documents…</p>}

      {!loading && docs.length === 0 && (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO DOCUMENTS UPLOADED
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {docs.map((doc) => (
          <div key={doc.id} style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                {categoryLabel(doc.category)}
              </div>
              <div style={{ fontFamily: S.sans, fontWeight: 500, fontSize: "0.95rem" }}>{doc.title}</div>
              {doc.description && <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight, marginTop: "0.2rem" }}>{doc.description}</div>}
            </div>
            <div style={{ textAlign: "right", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.06em" }}>
              <div>{formatBytes(doc.sizeBytes)}</div>
              <div style={{ marginTop: "0.2rem" }}>{doc.mimeType}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useRef, useState } from "react";
import { bulkImportUnits, UnitImportRow }     from "@/services/members";
import { bulkImportVendors, VendorImportRow, VendorCategory } from "@/services/vendors";
import { bulkImportTransactions } from "@/services/treasury";
import type { AssessmentType }    from "@/services/treasury";

// ─── Design tokens ────────────────────────────────────────────────────────────

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  sage:     "#5A8C58",
  amber:    "#D4860A",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  paper:    "#F9F6F0",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

// ─── CSV parser (no external deps) ────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) { inQuotes = true; }
      else if (ch === '"' && inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"' && inQuotes) { inQuotes = false; }
      else if (ch === ',' && !inQuotes) { result.push(cur); cur = ""; }
      else { cur += ch; }
    }
    result.push(cur);
    return result;
  };
  const headers = parseRow(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? "").trim()]));
  });
  return { headers, rows };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportType = "Units" | "Transactions" | "Vendors";
type Step = 0 | 1 | 2 | 3;  // Upload | Map | Preview | Import

interface FieldDef {
  key:      string;
  label:    string;
  required: boolean;
}

const FIELD_DEFS: Record<ImportType, FieldDef[]> = {
  Units: [
    { key: "unitId",    label: "Unit ID",    required: true },
    { key: "ownerName", label: "Owner Name", required: true },
    { key: "email",     label: "Email",      required: true },
  ],
  Transactions: [
    { key: "unitId",      label: "Unit ID",     required: true },
    { key: "date",        label: "Date",        required: true },
    { key: "amountCents", label: "Amount ($)",  required: true },
    { key: "category",    label: "Category",    required: true },
    { key: "description", label: "Description", required: true },
  ],
  Vendors: [
    { key: "name",    label: "Vendor Name", required: true },
    { key: "trade",   label: "Trade",       required: true },
    { key: "contact", label: "Contact",     required: true },
  ],
};

// AppFolio column guesses
const APPFOLIO_GUESSES: Record<ImportType, Record<string, string>> = {
  Units: {
    "Unit":       "unitId",
    "Owner Name": "ownerName",
    "Email":      "email",
  },
  Transactions: {
    "Unit":             "unitId",
    "Date":             "date",
    "Amount":           "amountCents",
    "Type":             "category",
    "Description/Memo": "description",
  },
  Vendors: {
    "Vendor Name": "name",
    "Trade":       "trade",
    "Phone":       "contact",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateUnitRow(mapped: Record<string, string>): string | null {
  if (!mapped.unitId)    return "Missing Unit ID";
  if (!mapped.ownerName) return "Missing Owner Name";
  return null;
}

function validateTxRow(mapped: Record<string, string>): string | null {
  if (!mapped.unitId)  return "Missing Unit ID";
  if (!mapped.date)    return "Missing Date";
  if (!mapped.amountCents || isNaN(Number(mapped.amountCents))) return "Invalid Amount";
  return null;
}

function validateVendorRow(mapped: Record<string, string>): string | null {
  if (!mapped.name) return "Missing Vendor Name";
  return null;
}

function validateRow(importType: ImportType, mapped: Record<string, string>): string | null {
  if (importType === "Units")        return validateUnitRow(mapped);
  if (importType === "Transactions") return validateTxRow(mapped);
  if (importType === "Vendors")      return validateVendorRow(mapped);
  return null;
}

function mapTxCategory(raw: string): AssessmentType {
  const lower = raw.toLowerCase();
  if (lower.includes("special"))   return { SpecialAssessment: null };
  if (lower.includes("fine"))      return { Fine: null };
  return { MonthlyDues: null };
}

function mapVendorCategory(raw: string): VendorCategory {
  const lower = raw.toLowerCase();
  if (lower.includes("plumb"))      return { Plumbing: null };
  if (lower.includes("electric"))   return { Electrical: null };
  if (lower.includes("landscap"))   return { Landscaping: null };
  if (lower.includes("hvac") || lower.includes("heat") || lower.includes("cool")) return { HVAC: null };
  if (lower.includes("clean"))      return { Cleaning: null };
  if (lower.includes("roof"))       return { Roofing: null };
  if (lower.includes("paint"))      return { Painting: null };
  return { Other: null };
}

function applyMapping(
  raw: Record<string, string>,
  mapping: Record<string, string>  // fieldKey -> csvHeader
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [fieldKey, csvHeader] of Object.entries(mapping)) {
    result[fieldKey] = csvHeader ? (raw[csvHeader] ?? "") : "";
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MigrationPage() {
  const [importType, setImportType] = useState<ImportType>("Units");
  const [step, setStep]             = useState<Step>(0);
  const [csvData, setCsvData]       = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [mapping, setMapping]       = useState<Record<string, string>>({});  // fieldKey -> csvHeader
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName]     = useState("");
  const [importResult, setImportResult] = useState<{
    succeeded: number; failed: number; errors: string[]
  } | null>(null);
  const [importing, setImporting]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset when import type changes ──────────────────────────────────────────
  function handleTypeChange(t: ImportType) {
    setImportType(t);
    setStep(0);
    setCsvData(null);
    setMapping({});
    setFileName("");
    setImportResult(null);
  }

  // ── Step 0: file handling ────────────────────────────────────────────────────
  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setCsvData(parsed);
      // Auto-guess mapping
      const guesses = APPFOLIO_GUESSES[importType];
      const fields  = FIELD_DEFS[importType];
      const newMapping: Record<string, string> = {};
      for (const field of fields) {
        newMapping[field.key] = "";
        for (const [csvHeader, fieldKey] of Object.entries(guesses)) {
          if (fieldKey === field.key && parsed.headers.includes(csvHeader)) {
            newMapping[field.key] = csvHeader;
            break;
          }
        }
      }
      setMapping(newMapping);
      setStep(1);
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // ── Step 2: preview rows ─────────────────────────────────────────────────────
  const previewRows = csvData
    ? csvData.rows.slice(0, 10).map(raw => {
        const mapped = applyMapping(raw, mapping);
        const error  = validateRow(importType, mapped);
        return { raw, mapped, error };
      })
    : [];

  // ── Step 3: import ───────────────────────────────────────────────────────────
  async function runImport() {
    if (!csvData) return;
    setImporting(true);
    setImportResult(null);

    let totalSucceeded = 0;
    let totalFailed    = 0;
    const allErrors: string[] = [];

    const allMapped = csvData.rows.map(raw => applyMapping(raw, mapping));
    const BATCH = 500;

    try {
      if (importType === "Units") {
        for (let i = 0; i < allMapped.length; i += BATCH) {
          const slice = allMapped.slice(i, i + BATCH);
          const rows: UnitImportRow[] = slice.map(m => ({
            unitId:    m.unitId    ?? "",
            ownerName: m.ownerName ?? "",
            email:     m.email     ?? "",
          }));
          const result = await bulkImportUnits(rows);
          totalSucceeded += Number(result.succeeded);
          totalFailed    += Number(result.failed);
          allErrors.push(...result.errors);
        }
      } else if (importType === "Transactions") {
        for (let i = 0; i < allMapped.length; i += BATCH) {
          const slice = allMapped.slice(i, i + BATCH);
          const rows = slice.map(m => ({
            unitId:      m.unitId ?? "",
            dateNs:      BigInt(new Date(m.date ?? "").getTime()) * BigInt(1_000_000),
            amountCents: BigInt(Math.round(Number(m.amountCents ?? "0") * 100)),
            category:    mapTxCategory(m.category ?? ""),
            description: m.description ?? "",
          }));
          const result = await bulkImportTransactions(rows);
          totalSucceeded += Number(result.succeeded);
          totalFailed    += Number(result.failed);
          allErrors.push(...result.errors);
        }
      } else if (importType === "Vendors") {
        for (let i = 0; i < allMapped.length; i += BATCH) {
          const slice = allMapped.slice(i, i + BATCH);
          const rows: VendorImportRow[] = slice.map(m => ({
            name:    m.name    ?? "",
            trade:   mapVendorCategory(m.trade ?? ""),
            contact: m.contact ?? "",
          }));
          const result = await bulkImportVendors(rows);
          totalSucceeded += Number(result.succeeded);
          totalFailed    += Number(result.failed);
          allErrors.push(...result.errors);
        }
      }
    } catch (err: any) {
      allErrors.push(String(err?.message ?? err));
      totalFailed += csvData.rows.length - totalSucceeded;
    }

    setImportResult({ succeeded: totalSucceeded, failed: totalFailed, errors: allErrors });
    setImporting(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const stepLabels = ["Upload", "Map", "Preview", "Import"];

  return (
    <div style={{ fontFamily: S.sans, color: S.ink, maxWidth: 800 }}>
      {/* Page heading */}
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.6rem", marginBottom: "0.25rem" }}>
        AppFolio Migration
      </h1>
      <p style={{ color: S.inkLight, fontSize: "0.85rem", marginBottom: "2rem" }}>
        Import your existing roster, transactions, or vendor directory from an AppFolio CSV export.
      </p>

      {/* Import type tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
        {(["Units", "Transactions", "Vendors"] as ImportType[]).map(t => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: importType === t ? `2px solid ${S.navy}` : "2px solid transparent",
              color: importType === t ? S.navy : S.inkLight,
              fontFamily: S.mono,
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.5rem 1.25rem",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", alignItems: "center" }}>
        {stepLabels.map((label, idx) => (
          <React.Fragment key={label}>
            <div style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              color: idx === step ? S.navy : idx < step ? S.sage : S.inkLight,
            }}>
              <span style={{
                width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${idx === step ? S.navy : idx < step ? S.sage : S.rule}`,
                fontFamily: S.mono, fontSize: "0.65rem",
                background: idx < step ? S.sage : "transparent",
                color: idx < step ? "#fff" : undefined,
              }}>
                {idx < step ? "✓" : idx + 1}
              </span>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {label}
              </span>
            </div>
            {idx < stepLabels.length - 1 && (
              <span style={{ flex: 1, height: 1, background: S.rule }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 0: Upload ─────────────────────────────────────────────────────── */}
      {step === 0 && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? S.navy : S.rule}`,
              padding: "3rem 2rem",
              textAlign: "center",
              cursor: "pointer",
              background: isDragging ? "#EEF2F8" : "transparent",
              transition: "background 0.1s",
            }}
          >
            <div style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.5rem" }}>
              DRAG & DROP CSV
            </div>
            <div style={{ fontSize: "0.85rem", color: S.inkLight }}>
              or click to browse — AppFolio CSV export format
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={onFileInput}
          />
        </div>
      )}

      {/* ── Step 1: Map columns ───────────────────────────────────────────────── */}
      {step === 1 && csvData && (
        <div>
          <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>
            Map Columns
          </h2>
          <p style={{ color: S.inkLight, fontSize: "0.82rem", marginBottom: "1.5rem" }}>
            File: <strong>{fileName}</strong> — {csvData.rows.length} rows detected.
            Match each required field to a column from your CSV.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rule}` }}>
                <th style={{ textAlign: "left", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.4rem 0.75rem" }}>REQUIRED FIELD</th>
                <th style={{ textAlign: "left", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.4rem 0.75rem" }}>CSV COLUMN</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_DEFS[importType].map(field => (
                <tr key={field.key} style={{ borderBottom: `1px solid ${S.rule}` }}>
                  <td style={{ padding: "0.6rem 0.75rem", fontFamily: S.mono, fontSize: "0.75rem" }}>
                    {field.label}
                    {field.required && <span style={{ color: S.rust, marginLeft: 4 }}>*</span>}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                      style={{
                        border: `1px solid ${S.rule}`, padding: "0.3rem 0.5rem",
                        fontFamily: S.sans, fontSize: "0.82rem", background: S.paper,
                        color: S.ink, width: "100%",
                      }}
                    >
                      <option value="">— not mapped —</option>
                      {csvData.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button onClick={() => setStep(0)} style={btnStyle("secondary")}>Back</button>
            <button onClick={() => setStep(2)} style={btnStyle("primary")}>Preview</button>
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ───────────────────────────────────────────────────── */}
      {step === 2 && csvData && (
        <div>
          <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>
            Preview
          </h2>
          <p style={{ color: S.inkLight, fontSize: "0.82rem", marginBottom: "1.5rem" }}>
            Showing first 10 of {csvData.rows.length} rows. Red rows will be skipped.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rule}` }}>
                  {FIELD_DEFS[importType].map(f => (
                    <th key={f.key} style={{ textAlign: "left", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.4rem 0.75rem" }}>
                      {f.label.toUpperCase()}
                    </th>
                  ))}
                  <th style={{ textAlign: "left", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.4rem 0.75rem" }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: `1px solid ${S.rule}`,
                      background: row.error ? "#FFF5F4" : "transparent",
                    }}
                  >
                    {FIELD_DEFS[importType].map(f => (
                      <td key={f.key} style={{ padding: "0.5rem 0.75rem", color: row.error ? S.rust : S.ink }}>
                        {row.mapped[f.key] || <span style={{ color: S.rule }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      {row.error
                        ? <span style={{ color: S.rust, fontFamily: S.mono, fontSize: "0.65rem" }}>{row.error}</span>
                        : <span style={{ color: S.sage, fontFamily: S.mono, fontSize: "0.65rem" }}>OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button onClick={() => setStep(1)} style={btnStyle("secondary")}>Back</button>
            <button onClick={() => { setStep(3); runImport(); }} style={btnStyle("primary")}>Import {csvData.rows.length} Rows</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Import progress & result ─────────────────────────────────── */}
      {step === 3 && (
        <div>
          <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem" }}>
            {importing ? "Importing…" : "Import Complete"}
          </h2>

          {importing && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", color: S.inkLight, fontSize: "0.85rem" }}>
              <div style={{
                width: 20, height: 20, border: `2px solid ${S.rule}`,
                borderTopColor: S.navy, borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              Processing rows…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {!importing && importResult && (
            <div>
              <div style={{ display: "flex", gap: "2rem", marginBottom: "1.5rem" }}>
                <div style={{ border: `1px solid ${S.sage}`, padding: "1rem 1.5rem", minWidth: 100 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.25rem" }}>SUCCEEDED</div>
                  <div style={{ fontFamily: S.serif, fontSize: "1.8rem", fontWeight: 700, color: S.sage }}>{importResult.succeeded}</div>
                </div>
                <div style={{ border: `1px solid ${importResult.failed > 0 ? S.rust : S.rule}`, padding: "1rem 1.5rem", minWidth: 100 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.25rem" }}>FAILED</div>
                  <div style={{ fontFamily: S.serif, fontSize: "1.8rem", fontWeight: 700, color: importResult.failed > 0 ? S.rust : S.inkLight }}>{importResult.failed}</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.5rem" }}>
                    ERRORS ({importResult.errors.length})
                  </div>
                  <div style={{ border: `1px solid ${S.rule}`, maxHeight: 240, overflowY: "auto", fontSize: "0.78rem" }}>
                    {importResult.errors.map((err, i) => (
                      <div key={i} style={{
                        padding: "0.4rem 0.75rem",
                        borderBottom: i < importResult.errors.length - 1 ? `1px solid ${S.rule}` : "none",
                        color: S.rust, fontFamily: S.mono,
                      }}>
                        {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                <button onClick={() => { setStep(0); setCsvData(null); setMapping({}); setFileName(""); setImportResult(null); }} style={btnStyle("secondary")}>
                  Start New Import
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Button style helper ──────────────────────────────────────────────────────

function btnStyle(variant: "primary" | "secondary"): React.CSSProperties {
  return {
    border: `1px solid ${variant === "primary" ? "#1B2D4F" : "#C8C3B8"}`,
    background: variant === "primary" ? "#1B2D4F" : "transparent",
    color: variant === "primary" ? "#F9F6F0" : "#0E0E0C",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.65rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
  };
}

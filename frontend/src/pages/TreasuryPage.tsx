import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import {
  getAssessmentsForUnit, getTotalOutstandingCents, waiveAssessment, waiveLateFee,
  createDuesCheckoutSession, verifyDuesSession,
  getLateFeePolicy, getReminderPolicy, setLateFeePolicy, setReminderPolicy, setEmailConfig,
  getPaymentHistory, getReminderLog,
  getAgingReport, getReserveFundReport, getBudgetVsActual, getIncomeStatement, getAnnualStatement,
  setReserveFundBalance, setBudgetLine,
  getDelinquentUnits, getCollectionHistory, openCollectionCase, escalateCollection, resolveCollection,
  getQBOStatus, setQBOConfig, getQBOSyncLog, retrySync,
  getCkUSDCStatus, getCkUSDCPayments, enableCkUSDC, disableCkUSDC, setUsdcRate, confirmCkUSDCPayment,
  type Assessment, type LateFeePolicy, type ReminderPolicy, type EmailConfig, type DuesPayment, type ReminderLog,
  type AgingReport, type ReserveFundReport, type BudgetVsActual, type IncomeStatement, type AnnualStatement,
  type DelinquencyRecord, type CollectionEvent, type CollectionStage,
  type QBOConfig, type QBOSyncEntry,
  type CkUSDCStatus, type CkUSDCPayment,
} from "@/services/treasury";
import { getMyProfile } from "@/services/members";

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  sage:     "#5A8C58",
  amber:    "#D4860A",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

function centsToDisplay(cents: bigint): string {
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusColor(status: Assessment["status"]): string {
  if ("Outstanding" in status) return S.amber;
  if ("Paid"        in status) return S.sage;
  if ("Waived"      in status) return S.inkLight;
  if ("Disputed"    in status) return S.rust;
  return S.inkLight;
}

function statusLabel(status: Assessment["status"]): string {
  return Object.keys(status)[0].toUpperCase();
}

function kindLabel(kind: Assessment["kind"]): string {
  if ("MonthlyDues"       in kind) return "Monthly Dues";
  if ("SpecialAssessment" in kind) return "Special Assessment";
  if ("Fine"              in kind) return "Fine";
  if ("Amenity"           in kind) return "Amenity Fee";
  if ("LateFee"           in kind) return "Late Fee";
  return "Assessment";
}

// ─── Pay button ───────────────────────────────────────────────────────────────

function PayButton({ assessment, onPaid }: { assessment: Assessment; onPaid: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState<string | null>(null);

  // On return from Stripe, ?session_id=xxx is in the URL
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    // Clear the param immediately to avoid re-running
    window.history.replaceState({}, "", window.location.pathname);
    verifyDuesSession(sessionId, assessment.id).then((res) => {
      if ("ok" in res) onPaid();
      else setError("Payment verification failed — contact your board.");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!("Outstanding" in assessment.status)) return null;

  async function handlePay() {
    setLoading(true);
    setError(null);
    const res = await createDuesCheckoutSession(assessment.id);
    if ("err" in res) {
      setLoading(false);
      if ("PaymentFailed" in res.err) setError(res.err.PaymentFailed);
      else setError("Could not start checkout");
      return;
    }
    window.location.href = res.ok.url;
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button
        onClick={handlePay}
        disabled={loading}
        style={{
          background: S.navy, color: "#fff", border: "none",
          fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
          textTransform: "uppercase", padding: "0.4rem 1rem", cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Loading…" : "Pay Now"}
      </button>
      {error && <div style={{ color: S.rust, fontFamily: S.mono, fontSize: "0.6rem", marginTop: "0.25rem" }}>{error}</div>}
    </div>
  );
}

// ─── Board policy panel ───────────────────────────────────────────────────────

function PolicyPanel() {
  const [lateFee,   setLateFee  ] = useState<LateFeePolicy | null>(null);
  const [reminder,  setReminder ] = useState<ReminderPolicy | null>(null);
  const [saving,    setSaving   ] = useState(false);
  const [saved,     setSaved    ] = useState(false);

  // Local editable fields
  const [graceDays,  setGraceDays ] = useState("5");
  const [flatCents,  setFlatCents ] = useState("2500");
  const [percentBps, setPercentBps] = useState("0");
  const [preDays,    setPreDays   ] = useState("7,3,1");
  const [postDays,   setPostDays  ] = useState("1,7,14");

  // Email config (#32)
  const [resendApiKey,    setResendApiKey   ] = useState("");
  const [fromEmail,       setFromEmail      ] = useState("");
  const [fromName,        setFromName       ] = useState("");
  const [savingEmail,     setSavingEmail    ] = useState(false);
  const [savedEmail,      setSavedEmail     ] = useState(false);

  useEffect(() => {
    Promise.all([getLateFeePolicy(), getReminderPolicy()]).then(([lf, rp]) => {
      if (lf) {
        setLateFee(lf);
        setGraceDays(lf.gracePeriodDays.toString());
        setFlatCents(lf.flatAmountCents.toString());
        setPercentBps(lf.percentBps.toString());
      }
      if (rp) {
        setReminder(rp);
        setPreDays(rp.preDueDays.map(String).join(","));
        setPostDays(rp.postDueDays.map(String).join(","));
      }
    });
  }, []);

  function parseDays(s: string): bigint[] {
    return s.split(",").map((v) => BigInt(parseInt(v.trim(), 10) || 0)).filter((v) => v > 0n);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const lf: LateFeePolicy = {
      gracePeriodDays: BigInt(parseInt(graceDays, 10) || 0),
      flatAmountCents: BigInt(parseInt(flatCents, 10) || 0),
      percentBps:      BigInt(parseInt(percentBps, 10) || 0),
      escalation:      [],
    };
    const rp: ReminderPolicy = {
      preDueDays:  parseDays(preDays),
      postDueDays: parseDays(postDays),
    };
    await Promise.all([setLateFeePolicy(lf), setReminderPolicy(rp)]);
    setLateFee(lf);
    setReminder(rp);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSaveEmail() {
    if (!resendApiKey || !fromEmail || !fromName) return;
    setSavingEmail(true);
    setSavedEmail(false);
    const cfg: EmailConfig = { resendApiKey, fromEmail, fromName };
    await setEmailConfig(cfg);
    setSavingEmail(false);
    setSavedEmail(true);
    setTimeout(() => setSavedEmail(false), 3000);
  }

  const fieldStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.78rem", border: `1px solid ${S.rule}`,
    padding: "0.35rem 0.5rem", width: "100%", background: "#fff", color: S.ink,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
    color: S.inkLight, textTransform: "uppercase", display: "block", marginBottom: "0.3rem",
  };

  return (
    <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginTop: "2.5rem" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "1.25rem" }}>
        Board — Automation Policy
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
        <div>
          <label style={labelStyle}>Grace period (days)</label>
          <input value={graceDays}  onChange={(e) => setGraceDays(e.target.value)}  style={fieldStyle} type="number" min="0" />
        </div>
        <div>
          <label style={labelStyle}>Late fee flat (cents)</label>
          <input value={flatCents}  onChange={(e) => setFlatCents(e.target.value)}  style={fieldStyle} type="number" min="0" />
          <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.2rem" }}>e.g. 2500 = $25.00</div>
        </div>
        <div>
          <label style={labelStyle}>Late fee % (basis pts)</label>
          <input value={percentBps} onChange={(e) => setPercentBps(e.target.value)} style={fieldStyle} type="number" min="0" />
          <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.2rem" }}>e.g. 500 = 5%</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
        <div>
          <label style={labelStyle}>Pre-due reminders (days before, comma-sep)</label>
          <input value={preDays}  onChange={(e) => setPreDays(e.target.value)}  style={fieldStyle} placeholder="7,3,1" />
        </div>
        <div>
          <label style={labelStyle}>Post-due reminders (days after, comma-sep)</label>
          <input value={postDays} onChange={(e) => setPostDays(e.target.value)} style={fieldStyle} placeholder="1,7,14" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: S.navy, color: "#fff", border: "none",
            fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
            textTransform: "uppercase", padding: "0.45rem 1.25rem",
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save Policy"}
        </button>
        {saved && <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.sage }}>Saved</span>}
      </div>
      {(lateFee || reminder) && (
        <div style={{ marginTop: "1rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
          {lateFee && (
            <span>Late fee: ${(Number(lateFee.flatAmountCents) / 100).toFixed(2)} flat after {lateFee.gracePeriodDays.toString()}d grace</span>
          )}
          {lateFee && reminder && <span style={{ margin: "0 0.5rem" }}>·</span>}
          {reminder && (
            <span>Reminders: pre [{reminder.preDueDays.map(String).join(",")}]d, post [{reminder.postDueDays.map(String).join(",")}]d</span>
          )}
        </div>
      )}

      {/* Email Config (#32) */}
      <div style={{ marginTop: "2rem", borderTop: `1px solid ${S.rule}`, paddingTop: "1.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "1rem" }}>
          Email Delivery (Resend)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={labelStyle}>Resend API Key</label>
            <input value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} style={fieldStyle} type="password" placeholder="re_…" />
          </div>
          <div>
            <label style={labelStyle}>From Email</label>
            <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} style={fieldStyle} type="email" placeholder="hoa@example.com" />
          </div>
          <div>
            <label style={labelStyle}>From Name</label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} style={fieldStyle} placeholder="Quorum HOA" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={handleSaveEmail}
            disabled={savingEmail || !resendApiKey || !fromEmail || !fromName}
            style={{
              background: S.navy, color: "#fff", border: "none",
              fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "0.45rem 1.25rem",
              cursor: (savingEmail || !resendApiKey || !fromEmail || !fromName) ? "default" : "pointer",
              opacity: (savingEmail || !resendApiKey || !fromEmail || !fromName) ? 0.6 : 1,
            }}
          >
            {savingEmail ? "Saving…" : "Save Email Config"}
          </button>
          {savedEmail && <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.sage }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Reports panel (#15) ─────────────────────────────────────────────────────

function ReportsPanel({ unitId }: { unitId: string | null }) {
  const [aging,    setAging   ] = useState<AgingReport | null>(null);
  const [reserve,  setReserve ] = useState<ReserveFundReport | null>(null);
  const [budget,   setBudget  ] = useState<BudgetVsActual[]>([]);
  const [income,   setIncome  ] = useState<IncomeStatement | null>(null);
  const [loading,  setLoading ] = useState(true);
  const [year,     setYear    ] = useState(new Date().getFullYear());

  // Reserve fund balance editor
  const [reserveInput, setReserveInput] = useState("");
  const [savingReserve, setSavingReserve] = useState(false);

  useEffect(() => {
    const yearStart = BigInt(new Date(year, 0, 1).getTime()) * BigInt(1_000_000);
    const yearEnd   = BigInt(new Date(year + 1, 0, 1).getTime()) * BigInt(1_000_000);
    Promise.all([
      getAgingReport(),
      getReserveFundReport(),
      getBudgetVsActual(year),
      getIncomeStatement(yearStart, yearEnd),
    ]).then(([a, r, b, i]) => {
      setAging(a);
      setReserve(r);
      setBudget(b);
      setIncome(i);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [year]);

  async function handleSaveReserve() {
    const val = parseInt(reserveInput, 10);
    if (isNaN(val) || val < 0) return;
    setSavingReserve(true);
    await setReserveFundBalance(BigInt(val));
    const updated = await getReserveFundReport();
    setReserve(updated);
    setSavingReserve(false);
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
    color: S.inkLight, textTransform: "uppercase", display: "block", marginBottom: "0.3rem",
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em",
    color: S.inkLight, textTransform: "uppercase", marginBottom: "1rem",
  };

  if (loading) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading reports…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Year selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={sectionTitle}>Fiscal Year</span>
        <select
          value={year}
          onChange={(e) => { setLoading(true); setYear(Number(e.target.value)); }}
          style={{ fontFamily: S.mono, fontSize: "0.75rem", border: `1px solid ${S.rule}`, padding: "0.25rem 0.5rem" }}
        >
          {[2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Income statement */}
      {income && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={sectionTitle}>Income Statement — {year}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <div style={labelStyle}>Total Income</div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem", color: S.sage }}>
                {centsToDisplay(income.totalIncomeCents)}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Net Operating Income</div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.5rem" }}>
                {centsToDisplay(income.netOperatingIncomeCents < 0n ? -income.netOperatingIncomeCents : income.netOperatingIncomeCents)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aging report */}
      {aging && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={sectionTitle}>Accounts Receivable Aging</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
            {[
              { label: "0–30 days",  entries: aging.current   },
              { label: "31–60 days", entries: aging.days31_60 },
              { label: "61–90 days", entries: aging.days61_90 },
              { label: "90+ days",   entries: aging.days90plus },
            ].map(({ label, entries }) => {
              const total = entries.reduce((s, e) => s + e.amountCents, BigInt(0));
              const color = label.startsWith("90") ? S.rust : label.startsWith("61") ? S.amber : S.ink;
              return (
                <div key={label} style={{ borderLeft: `3px solid ${color}`, paddingLeft: "0.75rem" }}>
                  <div style={labelStyle}>{label}</div>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color }}>
                    {centsToDisplay(total)}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.2rem" }}>
                    {entries.length} unit{entries.length !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: "1.25rem", borderTop: `1px solid ${S.rule}`, paddingTop: "0.75rem", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase" }}>Total Outstanding</span>
            <span style={{ fontFamily: S.serif, fontWeight: 700 }}>{centsToDisplay(aging.totalOutstandingCents)}</span>
          </div>
        </div>
      )}

      {/* Budget vs actual */}
      {budget.length > 0 && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={sectionTitle}>Budget vs. Actual — {year}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.sans, fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rule}` }}>
                {["Category", "Budgeted", "Actual", "Variance"].map((h) => (
                  <th key={h} style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", color: S.inkLight, textTransform: "uppercase", padding: "0.4rem 0.5rem", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {budget.map((row) => (
                <tr key={row.category} style={{ borderBottom: `1px solid ${S.rule}` }}>
                  <td style={{ padding: "0.5rem" }}>{row.category}</td>
                  <td style={{ padding: "0.5rem" }}>{centsToDisplay(row.budgetedCents)}</td>
                  <td style={{ padding: "0.5rem" }}>{centsToDisplay(row.actualCents)}</td>
                  <td style={{ padding: "0.5rem", color: row.varianceCents < 0n ? S.rust : S.sage }}>
                    {row.varianceCents < 0n ? "-" : "+"}{centsToDisplay(row.varianceCents < 0n ? -row.varianceCents : row.varianceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reserve fund */}
      {reserve && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={sectionTitle}>Reserve Fund Status</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <div style={labelStyle}>Current Balance</div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem" }}>{centsToDisplay(reserve.currentBalanceCents)}</div>
            </div>
            <div>
              <div style={labelStyle}>Recommended (30% of annual)</div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem" }}>{centsToDisplay(reserve.recommendedBalanceCents)}</div>
            </div>
            <div>
              <div style={labelStyle}>Funding Gap</div>
              <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem", color: reserve.fundingGapCents < 0n ? S.rust : S.sage }}>
                {reserve.fundingGapCents < 0n
                  ? `-${centsToDisplay(-reserve.fundingGapCents)}`
                  : `+${centsToDisplay(reserve.fundingGapCents)}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <div>
              <label style={labelStyle}>Update reserve balance (cents)</label>
              <input
                value={reserveInput}
                onChange={(e) => setReserveInput(e.target.value)}
                placeholder={reserve.currentBalanceCents.toString()}
                style={{ fontFamily: S.mono, fontSize: "0.75rem", border: `1px solid ${S.rule}`, padding: "0.3rem 0.5rem", width: "160px" }}
                type="number" min="0"
              />
            </div>
            <button
              onClick={handleSaveReserve}
              disabled={savingReserve}
              style={{
                background: S.navy, color: "#fff", border: "none", fontFamily: S.mono,
                fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "0.4rem 1rem", cursor: savingReserve ? "default" : "pointer", opacity: savingReserve ? 0.6 : 1,
              }}
            >
              {savingReserve ? "Saving…" : "Update"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Annual statement download (#41) ─────────────────────────────────────────

function AnnualStatementDownload({ unitId }: { unitId: string }) {
  const [year,      setYear     ] = useState(new Date().getFullYear());
  const [loading,   setLoading  ] = useState(false);
  const [error,     setError    ] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const stmt = await getAnnualStatement(unitId, year);
      if (!stmt) { setError("Could not load statement data."); return; }
      generatePDF(stmt, year);
    } catch {
      setError("Failed to generate statement.");
    } finally {
      setLoading(false);
    }
  }

  function generatePDF(stmt: AnnualStatement, yr: number) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const margin = 20;
    let y = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("HOA Annual Dues Statement", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Fiscal Year: ${yr}`, margin, y);
    y += 5;
    doc.text(`Unit: ${stmt.unitId}`, margin, y);
    y += 5;
    doc.text(`Generated: ${new Date(Number(stmt.generatedAt) / 1_000_000).toLocaleDateString()}`, margin, y);
    y += 10;

    doc.setDrawColor(200);
    doc.line(margin, y, 210 - margin, y);
    y += 8;

    // Summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("Summary", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rows: [string, string][] = [
      ["Total Billed",      `$${(Number(stmt.totalBilledCents) / 100).toFixed(2)}`],
      ["Total Paid",        `$${(Number(stmt.totalPaidCents) / 100).toFixed(2)}`],
      ["Outstanding Balance", `$${(Number(stmt.outstandingCents) / 100).toFixed(2)}`],
    ];
    for (const [label, value] of rows) {
      doc.text(label, margin, y);
      doc.text(value, 140, y);
      y += 6;
    }
    y += 6;

    doc.line(margin, y, 210 - margin, y);
    y += 8;

    // Payment table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Payment History", margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Date", margin, y);
    doc.text("Reference", margin + 35, y);
    doc.text("Amount", 140, y);
    y += 4;
    doc.setDrawColor(220);
    doc.line(margin, y, 210 - margin, y);
    y += 5;

    doc.setTextColor(0);
    if (stmt.payments.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.text("No payments recorded for this period.", margin, y);
      y += 6;
    } else {
      doc.setFont("helvetica", "normal");
      for (const p of stmt.payments) {
        const dateStr = new Date(Number(p.paidAt) / 1_000_000).toLocaleDateString();
        const ref     = p.stripePaymentId.slice(0, 22);
        const amount  = `$${(Number(p.amountCents) / 100).toFixed(2)}`;
        doc.text(dateStr, margin, y);
        doc.text(ref,     margin + 35, y);
        doc.text(amount,  140, y);
        y += 6;
        if (y > 260) { doc.addPage(); y = 20; }
      }
    }

    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("This document is for informational purposes only.", margin, y);
    y += 4;
    doc.text("Contact your HOA board to dispute any line item.", margin, y);

    doc.save(`hoa-statement-${stmt.unitId}-${yr}.pdf`);
  }

  return (
    <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginTop: "2rem" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "1rem" }}>
        Annual Dues Statement — PDF Download
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", color: S.inkLight, textTransform: "uppercase", display: "block", marginBottom: "0.3rem" }}>Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ fontFamily: S.mono, fontSize: "0.75rem", border: `1px solid ${S.rule}`, padding: "0.3rem 0.5rem" }}
          >
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleDownload}
          disabled={loading}
          style={{
            background: S.navy, color: "#fff", border: "none", fontFamily: S.mono,
            fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "0.45rem 1.25rem", cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1, marginTop: "1.2rem",
          }}
        >
          {loading ? "Generating…" : "Download PDF"}
        </button>
      </div>
      {error && <div style={{ color: S.rust, fontFamily: S.mono, fontSize: "0.6rem", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  );
}

// ─── Collections panel (#28) ─────────────────────────────────────────────────

const STAGES: Array<{ key: string; label: string }> = [
  { key: "GracePeriod",  label: "Grace Period"   },
  { key: "FirstNotice",  label: "First Notice"   },
  { key: "SecondNotice", label: "Second Notice"  },
  { key: "PreLien",      label: "Pre-Lien"       },
  { key: "Lien",         label: "Lien"           },
];

function stageColor(stage: CollectionStage): string {
  if ("GracePeriod"  in stage) return S.amber;
  if ("FirstNotice"  in stage) return S.rust;
  if ("SecondNotice" in stage) return S.rust;
  if ("PreLien"      in stage) return S.navy;
  if ("Lien"         in stage) return "#6B0000";
  if ("Resolved"     in stage) return S.sage;
  return S.inkLight;
}

function stageLabel(stage: CollectionStage): string {
  const key = Object.keys(stage)[0];
  return key.replace(/([A-Z])/g, " $1").trim();
}

function CollectionsPanel() {
  const [records,        setRecords       ] = useState<DelinquencyRecord[]>([]);
  const [loading,        setLoading       ] = useState(true);
  const [expandedUnit,   setExpandedUnit  ] = useState<string | null>(null);
  const [history,        setHistory       ] = useState<CollectionEvent[]>([]);
  const [histLoading,    setHistLoading   ] = useState(false);
  const [escalating,     setEscalating    ] = useState<string | null>(null);
  const [openingUnit,    setOpeningUnit   ] = useState<string | null>(null);
  const [newUnitId,      setNewUnitId     ] = useState("");
  const [selectedStage,  setSelectedStage ] = useState<Record<string, string>>({});
  const [note,           setNote          ] = useState<Record<string, string>>({});
  const [error,          setError         ] = useState<string | null>(null);

  useEffect(() => {
    getDelinquentUnits()
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleExpand(unitId: string) {
    if (expandedUnit === unitId) { setExpandedUnit(null); return; }
    setExpandedUnit(unitId);
    setHistLoading(true);
    const h = await getCollectionHistory(unitId).catch(() => []);
    setHistory(h);
    setHistLoading(false);
  }

  async function handleOpen() {
    if (!newUnitId.trim()) return;
    setOpeningUnit(newUnitId);
    setError(null);
    const res = await openCollectionCase(newUnitId.trim(), "Opened by board");
    if ("err" in res) {
      setError("InvalidInput" in res.err ? res.err.InvalidInput : "Error opening case");
    } else {
      setRecords((prev) => [...prev.filter((r) => r.unitId !== res.ok.unitId), res.ok]);
      setNewUnitId("");
    }
    setOpeningUnit(null);
  }

  async function handleEscalate(unitId: string) {
    const stage = selectedStage[unitId];
    if (!stage) return;
    setEscalating(unitId);
    const stageVariant = { [stage]: null } as CollectionStage;
    const res = await escalateCollection(unitId, stageVariant, note[unitId] ?? "");
    if ("ok" in res) {
      setRecords((prev) => prev.map((r) => r.unitId === unitId ? res.ok : r));
      setSelectedStage((p) => ({ ...p, [unitId]: "" }));
      setNote((p) => ({ ...p, [unitId]: "" }));
      if (expandedUnit === unitId) {
        const h = await getCollectionHistory(unitId).catch(() => []);
        setHistory(h);
      }
    }
    setEscalating(null);
  }

  async function handleResolve(unitId: string) {
    const res = await resolveCollection(unitId, note[unitId] ?? "Resolved by board");
    if ("ok" in res) {
      setRecords((prev) => prev.filter((r) => r.unitId !== unitId));
      if (expandedUnit === unitId) setExpandedUnit(null);
    }
  }

  const fieldStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.75rem", border: `1px solid ${S.rule}`,
    padding: "0.3rem 0.5rem", background: "#fff", color: S.ink,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
    color: S.inkLight, textTransform: "uppercase", display: "block", marginBottom: "0.3rem",
  };

  return (
    <div>
      {/* Open new case */}
      <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Open collection case for unit</label>
          <input
            value={newUnitId}
            onChange={(e) => setNewUnitId(e.target.value)}
            placeholder="e.g. 12A"
            style={{ ...fieldStyle, width: "100%" }}
          />
        </div>
        <button
          onClick={handleOpen}
          disabled={!!openingUnit || !newUnitId.trim()}
          style={{
            background: S.navy, color: "#fff", border: "none", fontFamily: S.mono,
            fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "0.45rem 1.25rem", cursor: "pointer", opacity: openingUnit ? 0.6 : 1,
          }}
        >
          {openingUnit ? "Opening…" : "Open Case"}
        </button>
      </div>
      {error && <div style={{ color: S.rust, fontFamily: S.mono, fontSize: "0.6rem", marginBottom: "1rem" }}>{error}</div>}

      {loading ? (
        <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading collection cases…</p>
      ) : records.length === 0 ? (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO ACTIVE COLLECTION CASES
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {records.map((r) => (
            <div key={r.unitId} style={{ border: `1px solid ${S.rule}`, background: "#fff" }}>
              {/* Row header */}
              <div
                style={{ padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem", cursor: "pointer" }}
                onClick={() => handleExpand(r.unitId)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: stageColor(r.stage), textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    {stageLabel(r.stage)}
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.9rem", fontWeight: 500 }}>Unit {r.unitId}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.15rem" }}>
                    Opened {new Date(Number(r.openedAt) / 1_000_000).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.rust }}>{centsToDisplay(r.totalOverdueCents)}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>overdue</div>
                </div>
                <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>
                  {expandedUnit === r.unitId ? "▲" : "▼"}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedUnit === r.unitId && (
                <div style={{ borderTop: `1px solid ${S.rule}`, padding: "1rem 1.5rem" }}>
                  {/* Escalate controls */}
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}>
                    <div>
                      <label style={labelStyle}>Escalate to stage</label>
                      <select
                        value={selectedStage[r.unitId] ?? ""}
                        onChange={(e) => setSelectedStage((p) => ({ ...p, [r.unitId]: e.target.value }))}
                        style={{ ...fieldStyle, minWidth: 140 }}
                      >
                        <option value="">— select —</option>
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Note</label>
                      <input
                        value={note[r.unitId] ?? ""}
                        onChange={(e) => setNote((p) => ({ ...p, [r.unitId]: e.target.value }))}
                        placeholder="e.g. Demand letter sent via certified mail"
                        style={{ ...fieldStyle, width: "100%" }}
                      />
                    </div>
                    <button
                      onClick={() => handleEscalate(r.unitId)}
                      disabled={escalating === r.unitId || !selectedStage[r.unitId]}
                      style={{
                        background: S.rust, color: "#fff", border: "none", fontFamily: S.mono,
                        fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "0.4rem 1rem", cursor: "pointer", opacity: escalating === r.unitId ? 0.6 : 1,
                      }}
                    >
                      {escalating === r.unitId ? "Saving…" : "Escalate"}
                    </button>
                    <button
                      onClick={() => handleResolve(r.unitId)}
                      style={{
                        background: S.sage, color: "#fff", border: "none", fontFamily: S.mono,
                        fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "0.4rem 1rem", cursor: "pointer",
                      }}
                    >
                      Resolve
                    </button>
                  </div>

                  {/* History */}
                  <div style={{ fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    Collection History
                  </div>
                  {histLoading ? (
                    <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight }}>Loading…</p>
                  ) : history.length === 0 ? (
                    <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>No history yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {history.map((evt) => (
                        <div key={evt.id} style={{ display: "flex", gap: "1rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                          <span style={{ minWidth: 90 }}>{new Date(Number(evt.createdAt) / 1_000_000).toLocaleDateString()}</span>
                          <span style={{ color: stageColor(evt.fromStage) }}>{stageLabel(evt.fromStage)}</span>
                          <span>→</span>
                          <span style={{ color: stageColor(evt.toStage) }}>{stageLabel(evt.toStage)}</span>
                          {evt.note && <span style={{ color: S.ink, fontFamily: S.sans, fontSize: "0.75rem" }}>{evt.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QuickBooks panel (#19) ───────────────────────────────────────────────────

function QBOPanel() {
  const [status,    setStatus   ] = useState<{ configured: boolean; realmId: string; tokenExpiry: bigint } | null>(null);
  const [syncLog,   setSyncLog  ] = useState<QBOSyncEntry[]>([]);
  const [saving,    setSaving   ] = useState(false);
  const [retrying,  setRetrying ] = useState<string | null>(null);
  const [error,     setError    ] = useState<string | null>(null);
  const [form,      setForm     ] = useState<QBOConfig>({ realmId: "", accessToken: "", refreshToken: "", tokenExpiry: BigInt(0) });

  useEffect(() => {
    Promise.all([getQBOStatus(), getQBOSyncLog()])
      .then(([s, log]) => { setStatus(s); setSyncLog(log); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!form.realmId || !form.accessToken) { setError("Realm ID and access token are required."); return; }
    setSaving(true);
    setError(null);
    await setQBOConfig(form).catch(() => setError("Failed to save configuration."));
    const s = await getQBOStatus().catch(() => null);
    if (s) setStatus(s);
    setSaving(false);
  }

  async function handleRetry(entryId: string) {
    setRetrying(entryId);
    setError(null);
    const res = await retrySync(entryId);
    if ("ok" in res) {
      setSyncLog((prev) => prev.map((e) => e.id === entryId ? res.ok : e));
    } else {
      setError("InvalidInput" in res.err ? res.err.InvalidInput : "Retry failed");
    }
    setRetrying(null);
  }

  function syncStatusColor(e: QBOSyncEntry): string {
    if ("Synced" in e.status) return "#2E7D32";
    if ("Failed" in e.status) return "#C94C2E";
    return "#7A7268";
  }

  function syncStatusLabel(e: QBOSyncEntry): string {
    if ("Synced" in e.status) return "Synced";
    if ("Failed" in e.status) return "Failed";
    return "Pending";
  }

  const inputStyle = {
    width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #C8C3B8",
    fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", background: "#fff",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Config form */}
      <div style={{ border: "1px solid #C8C3B8", padding: "1.5rem" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7A7268", marginBottom: "1rem" }}>
          QuickBooks Online Connection
          {status?.configured && (
            <span style={{ marginLeft: "1rem", color: "#2E7D32" }}>● Connected — Realm {status.realmId}</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#7A7268", display: "block", marginBottom: "0.25rem" }}>Realm ID (Company ID)</label>
            <input style={inputStyle} value={form.realmId} onChange={(e) => setForm((f) => ({ ...f, realmId: e.target.value }))} placeholder="9341453229301234" />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#7A7268", display: "block", marginBottom: "0.25rem" }}>Access Token</label>
            <input style={inputStyle} type="password" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} placeholder="eyJlbmMiOi..." />
          </div>
          <div>
            <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#7A7268", display: "block", marginBottom: "0.25rem" }}>Refresh Token</label>
            <input style={inputStyle} type="password" value={form.refreshToken} onChange={(e) => setForm((f) => ({ ...f, refreshToken: e.target.value }))} placeholder="AB11..." />
          </div>
        </div>
        {error && <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.8rem", color: "#C94C2E", marginBottom: "0.5rem" }}>{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "0.5rem 1.25rem", background: "#1B2D4F", color: "#F4F1EB", border: "none", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>

      {/* Sync log */}
      <div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7A7268", marginBottom: "0.75rem" }}>
          Sync Log — {syncLog.length} entries
        </div>
        {syncLog.length === 0 ? (
          <div style={{ padding: "2rem", border: "1px dashed #C8C3B8", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.7rem", color: "#7A7268" }}>
            No payments synced yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {syncLog.map((e) => (
              <div key={e.id} style={{ border: "1px solid #C8C3B8", padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", background: "#fff" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", color: "#7A7268", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
                    {e.id} · {e.unitId} · ${(Number(e.amountCents) / 100).toFixed(2)}
                  </div>
                  {e.errorMsg[0] && (
                    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.75rem", color: "#C94C2E" }}>{e.errorMsg[0]}</div>
                  )}
                  {e.qboPaymentId[0] && (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", color: "#2E7D32" }}>QBO #{e.qboPaymentId[0]}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: syncStatusColor(e) }}>
                    {syncStatusLabel(e)}
                  </span>
                  {"Failed" in e.status && (
                    <button
                      onClick={() => handleRetry(e.id)}
                      disabled={retrying === e.id}
                      style={{ padding: "0.25rem 0.75rem", border: "1px solid #C8C3B8", background: "transparent", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", letterSpacing: "0.06em", cursor: retrying === e.id ? "not-allowed" : "pointer", opacity: retrying === e.id ? 0.6 : 1 }}
                    >
                      {retrying === e.id ? "Retrying…" : "Retry"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ckUSDC panel (#23) ──────────────────────────────────────────────────────

function CkUSDCPanel() {
  const [status,     setStatus    ] = useState<CkUSDCStatus | null>(null);
  const [payments,   setPayments  ] = useState<CkUSDCPayment[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [saving,     setSaving    ] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error,      setError     ] = useState<string | null>(null);
  const [saved,      setSaved     ] = useState(false);

  const [principal,     setPrincipal    ] = useState("");
  const [rateCents,     setRateCents    ] = useState("100");
  const [feeBps,        setFeeBps       ] = useState("10");
  const [newRate,       setNewRate      ] = useState("");
  const [blockIdx,      setBlockIdx     ] = useState("");
  const [confirmUnit,   setConfirmUnit  ] = useState("");
  const [confirmAmt,    setConfirmAmt   ] = useState("");
  const [confirmMemo,   setConfirmMemo  ] = useState("");

  useEffect(() => {
    Promise.all([getCkUSDCStatus(), getCkUSDCPayments()])
      .then(([s, p]) => { setStatus(s); setPayments(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleEnable() {
    if (!principal) { setError("Treasury principal required"); return; }
    setSaving(true); setError(null);
    const res = await enableCkUSDC(principal, BigInt(parseInt(rateCents, 10) || 100), BigInt(parseInt(feeBps, 10) || 10));
    if ("ok" in res) {
      setStatus(res.ok);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError("NotAuthorized" in res.err ? "Not authorized" : "Failed to enable");
    }
    setSaving(false);
  }

  async function handleDisable() {
    setSaving(true); setError(null);
    const res = await disableCkUSDC();
    if ("ok" in res) {
      const updated = await getCkUSDCStatus();
      setStatus(updated);
    } else {
      setError("Failed to disable");
    }
    setSaving(false);
  }

  async function handleSetRate() {
    const r = parseInt(newRate, 10);
    if (!r || r <= 0) { setError("Rate must be > 0 cents"); return; }
    setSaving(true); setError(null);
    await setUsdcRate(BigInt(r));
    const updated = await getCkUSDCStatus();
    setStatus(updated);
    setNewRate("");
    setSaving(false);
  }

  async function handleConfirm() {
    const bi = parseInt(blockIdx, 10);
    const au = parseFloat(confirmAmt);
    if (!bi || !confirmUnit || !au) { setError("All confirm fields required"); return; }
    setConfirming(true); setError(null);
    const amountE8s = BigInt(Math.round(au * 100_000_000));
    const res = await confirmCkUSDCPayment(BigInt(bi), confirmUnit, amountE8s, confirmMemo || confirmUnit);
    if ("ok" in res) {
      setPayments(p => [...p, res.ok]);
      setBlockIdx(""); setConfirmUnit(""); setConfirmAmt(""); setConfirmMemo("");
    } else {
      setError("PaymentFailed" in res.err ? res.err.PaymentFailed : "Confirmation failed");
    }
    setConfirming(false);
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
    color: S.inkLight, textTransform: "uppercase", display: "block", marginBottom: "0.3rem",
  };
  const inputStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.78rem", border: `1px solid ${S.rule}`,
    padding: "0.35rem 0.5rem", background: "#fff", color: S.ink,
  };
  const btnStyle = (disabled?: boolean): React.CSSProperties => ({
    background: S.navy, color: "#fff", border: "none", fontFamily: S.mono,
    fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
    padding: "0.45rem 1.25rem", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
  });

  if (loading) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading ckUSDC…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Status + enable/disable */}
      <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "1rem" }}>
          ckUSDC Payments
          {status?.enabled && (
            <span style={{ marginLeft: "1rem", color: S.sage }}>● Enabled</span>
          )}
          {status && !status.enabled && (
            <span style={{ marginLeft: "1rem", color: S.rust }}>● Disabled</span>
          )}
        </div>

        {(!status || !status.enabled) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", gap: "0.75rem", marginBottom: "1rem" }}>
            <div>
              <label style={labelStyle}>Treasury Principal (residents send ckUSDC here)</label>
              <input value={principal} onChange={e => setPrincipal(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="aaaaa-aa..." />
            </div>
            <div>
              <label style={labelStyle}>USDC Rate (cents)</label>
              <input value={rateCents} onChange={e => setRateCents(e.target.value)} style={{ ...inputStyle, width: "100%" }} type="number" min="1" />
              <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.2rem" }}>e.g. 100 = $1.00/USDC</div>
            </div>
            <div>
              <label style={labelStyle}>Platform fee (bps)</label>
              <input value={feeBps} onChange={e => setFeeBps(e.target.value)} style={{ ...inputStyle, width: "100%" }} type="number" min="0" />
              <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.2rem" }}>10 = 0.1%</div>
            </div>
          </div>
        )}

        {error && <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, marginBottom: "0.5rem" }}>{error}</p>}

        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {(!status || !status.enabled) ? (
            <button onClick={handleEnable} disabled={saving || !principal} style={btnStyle(saving || !principal)}>
              {saving ? "Enabling…" : "Enable ckUSDC"}
            </button>
          ) : (
            <button onClick={handleDisable} disabled={saving} style={{ ...btnStyle(saving), background: S.rust }}>
              {saving ? "Disabling…" : "Disable"}
            </button>
          )}
          {saved && <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.sage }}>Saved</span>}
        </div>

        {/* Active config summary */}
        {status?.enabled && (
          <div style={{ marginTop: "1.25rem", padding: "1rem", background: "#F9F6F0", border: `1px solid ${S.rule}` }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Payment Address
            </div>
            <div style={{ fontFamily: S.mono, fontSize: "0.8rem", wordBreak: "break-all", color: S.ink, marginBottom: "0.5rem" }}>
              {status.treasuryPrincipal}
            </div>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
              Include your unit ID as the transfer memo · Rate: ${(Number(status.usdcRateCents) / 100).toFixed(2)}/USDC · Platform fee: {Number(status.platformFeeBps) / 100}%
            </div>

            {/* Update rate */}
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
              <div>
                <label style={labelStyle}>Update USDC rate (cents)</label>
                <input value={newRate} onChange={e => setNewRate(e.target.value)} style={{ ...inputStyle, width: "120px" }} type="number" min="1" placeholder={status.usdcRateCents.toString()} />
              </div>
              <button onClick={handleSetRate} disabled={saving || !newRate} style={btnStyle(saving || !newRate)}>
                Update Rate
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual payment confirmation */}
      {status?.enabled && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "1rem" }}>
            Confirm Payment (Board)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Block Index</label>
              <input value={blockIdx} onChange={e => setBlockIdx(e.target.value)} style={{ ...inputStyle, width: "100%" }} type="number" placeholder="12345678" />
            </div>
            <div>
              <label style={labelStyle}>Unit ID</label>
              <input value={confirmUnit} onChange={e => setConfirmUnit(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="10A" />
            </div>
            <div>
              <label style={labelStyle}>Amount (USDC)</label>
              <input value={confirmAmt} onChange={e => setConfirmAmt(e.target.value)} style={{ ...inputStyle, width: "100%" }} type="number" placeholder="150.00" />
            </div>
            <div>
              <label style={labelStyle}>Memo (optional)</label>
              <input value={confirmMemo} onChange={e => setConfirmMemo(e.target.value)} style={{ ...inputStyle, width: "100%" }} placeholder="Unit ID or note" />
            </div>
          </div>
          <button onClick={handleConfirm} disabled={confirming || !blockIdx || !confirmUnit || !confirmAmt} style={btnStyle(confirming || !blockIdx || !confirmUnit || !confirmAmt)}>
            {confirming ? "Confirming…" : "Confirm Payment"}
          </button>
        </div>
      )}

      {/* Payment history */}
      <div>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.75rem" }}>
          ckUSDC Payments — {payments.length} confirmed
        </div>
        {payments.length === 0 ? (
          <div style={{ padding: "2rem", border: `1px dashed ${S.rule}`, textAlign: "center", fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>
            No ckUSDC payments confirmed yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {payments.map(p => (
              <div key={p.id} style={{ border: `1px solid ${S.rule}`, padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginBottom: "0.2rem" }}>
                    {p.id} · Unit {p.unitId} · Block #{p.blockIndex.toString()}
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.85rem" }}>
                    {(Number(p.amountUsdc) / 100_000_000).toFixed(2)} USDC
                  </div>
                  {p.memo && <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>memo: {p.memo}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1rem", color: S.sage }}>
                    ${(Number(p.amountCents) / 100).toFixed(2)}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
                    {new Date(Number(p.confirmedAt) / 1_000_000).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [payments,         setPayments]         = useState<DuesPayment[]>([]);
  const [reminders,        setReminders]        = useState<ReminderLog[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState<bigint | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [unitId,           setUnitId]           = useState<string | null>(null);
  const [activeTab,        setActiveTab]        = useState<"assessments" | "history" | "reminders" | "reports" | "collections" | "quickbooks" | "ckusdc">("assessments");

  function reload(uid: string) {
    Promise.all([
      getAssessmentsForUnit(uid),
      getTotalOutstandingCents(),
      getPaymentHistory(uid),
      getReminderLog(uid),
    ]).then(([asmt, total, pays, rems]) => {
      setAssessments(asmt);
      setTotalOutstanding(total);
      setPayments(pays);
      setReminders(rems);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => {
    getMyProfile().then((member) => {
      if (!member) { setLoading(false); return; }
      setUnitId(member.unitId);
      reload(member.unitId);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading treasury…</p>;

  const outstanding = assessments.filter((a) => "Outstanding" in a.status);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: "none", border: "none",
    borderBottom: active ? `2px solid ${S.navy}` : "2px solid transparent",
    fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.08em",
    textTransform: "uppercase", padding: "0.5rem 0", marginRight: "1.5rem",
    cursor: "pointer", color: active ? S.navy : S.inkLight,
  });

  return (
    <div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Treasury</h1>
      <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "2rem" }}>
        Dues, assessments, and payment history
      </p>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.5rem" }}>My Outstanding</div>
          <div style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 700, color: outstanding.length ? S.amber : S.sage }}>
            {centsToDisplay(outstanding.reduce((s, a) => s + a.amountCents, BigInt(0)))}
          </div>
        </div>
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.5rem" }}>Community Outstanding</div>
          <div style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 700, color: S.ink }}>
            {totalOutstanding !== null ? centsToDisplay(totalOutstanding) : "—"}
          </div>
        </div>
        <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.5rem" }}>Payments Made</div>
          <div style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 700, color: S.navy }}>
            {payments.length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
        <button style={tabStyle(activeTab === "assessments")}  onClick={() => setActiveTab("assessments")}>Assessments</button>
        <button style={tabStyle(activeTab === "history")}      onClick={() => setActiveTab("history")}>Payment History</button>
        <button style={tabStyle(activeTab === "reminders")}    onClick={() => setActiveTab("reminders")}>Reminder Log</button>
        <button style={tabStyle(activeTab === "reports")}      onClick={() => setActiveTab("reports")}>Reports</button>
        <button style={tabStyle(activeTab === "collections")}  onClick={() => setActiveTab("collections")}>Collections</button>
        <button style={tabStyle(activeTab === "quickbooks")}   onClick={() => setActiveTab("quickbooks")}>QuickBooks</button>
        <button style={tabStyle(activeTab === "ckusdc")}       onClick={() => setActiveTab("ckusdc")}>ckUSDC</button>
      </div>

      {/* Assessments tab */}
      {activeTab === "assessments" && (
        assessments.length === 0 ? (
          <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            NO ASSESSMENTS
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {assessments.map((a) => (
              <div key={a.id} style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: "LateFee" in a.kind ? S.rust : S.inkLight, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    {kindLabel(a.kind)}
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.9rem" }}>{a.description}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.2rem" }}>
                    Due {new Date(Number(a.dueDate) / 1_000_000).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem" }}>{centsToDisplay(a.amountCents)}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: statusColor(a.status), textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    {statusLabel(a.status)}
                  </div>
                  {"Outstanding" in a.status && (
                    <PayButton
                      assessment={a}
                      onPaid={() => unitId && reload(unitId)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Payment history tab */}
      {activeTab === "history" && (
        payments.length === 0 ? (
          <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            NO PAYMENTS YET
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {payments.map((p) => (
              <div key={p.id} style={{ border: `1px solid ${S.rule}`, padding: "1rem 1.5rem", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    {new Date(Number(p.paidAt) / 1_000_000).toLocaleDateString()}
                  </div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.85rem" }}>Assessment {p.assessmentId}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight, marginTop: "0.15rem" }}>
                    ref: {p.stripePaymentId.slice(0, 20)}…
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.sage }}>{centsToDisplay(p.amountCents)}</div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.55rem", color: S.inkLight }}>
                    platform fee {centsToDisplay(p.platformFeeCents)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Reminder log tab */}
      {activeTab === "reminders" && (
        reminders.length === 0 ? (
          <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            NO REMINDERS LOGGED
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {reminders.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${S.rule}`, padding: "0.75rem 1.5rem", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase" }}>{r.reminderType}</div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.8rem", marginTop: "0.1rem" }}>Assessment {r.assessmentId}</div>
                </div>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
                  {new Date(Number(r.sentAt) / 1_000_000).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Reports tab */}
      {activeTab === "reports" && (
        <>
          <ReportsPanel unitId={unitId} />
          {unitId && <AnnualStatementDownload unitId={unitId} />}
        </>
      )}

      {/* Collections tab */}
      {activeTab === "collections" && <CollectionsPanel />}

      {/* QuickBooks tab */}
      {activeTab === "quickbooks" && <QBOPanel />}

      {/* ckUSDC tab */}
      {activeTab === "ckusdc" && <CkUSDCPanel />}

      {/* Board policy panel */}
      <PolicyPanel />
    </div>
  );
}

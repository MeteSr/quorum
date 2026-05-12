import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import {
  getAssessmentsForUnit, getTotalOutstandingCents, waiveAssessment, waiveLateFee,
  createDuesCheckoutSession, verifyDuesSession,
  getLateFeePolicy, getReminderPolicy, setLateFeePolicy, setReminderPolicy,
  getPaymentHistory, getReminderLog,
  getAgingReport, getReserveFundReport, getBudgetVsActual, getIncomeStatement, getAnnualStatement,
  setReserveFundBalance, setBudgetLine,
  type Assessment, type LateFeePolicy, type ReminderPolicy, type DuesPayment, type ReminderLog,
  type AgingReport, type ReserveFundReport, type BudgetVsActual, type IncomeStatement, type AnnualStatement,
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [payments,         setPayments]         = useState<DuesPayment[]>([]);
  const [reminders,        setReminders]        = useState<ReminderLog[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState<bigint | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [unitId,           setUnitId]           = useState<string | null>(null);
  const [activeTab,        setActiveTab]        = useState<"assessments" | "history" | "reminders" | "reports">("assessments");

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
        <button style={tabStyle(activeTab === "assessments")} onClick={() => setActiveTab("assessments")}>Assessments</button>
        <button style={tabStyle(activeTab === "history")}     onClick={() => setActiveTab("history")}>Payment History</button>
        <button style={tabStyle(activeTab === "reminders")}   onClick={() => setActiveTab("reminders")}>Reminder Log</button>
        <button style={tabStyle(activeTab === "reports")}     onClick={() => setActiveTab("reports")}>Reports</button>
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

      {/* Board policy panel */}
      <PolicyPanel />
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  getAssessmentsForUnit, getTotalOutstandingCents, waiveAssessment, waiveLateFee,
  createDuesCheckoutSession, verifyDuesSession,
  getLateFeePolicy, getReminderPolicy, setLateFeePolicy, setReminderPolicy,
  getPaymentHistory, getReminderLog,
  type Assessment, type LateFeePolicy, type ReminderPolicy, type DuesPayment, type ReminderLog,
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [payments,         setPayments]         = useState<DuesPayment[]>([]);
  const [reminders,        setReminders]        = useState<ReminderLog[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState<bigint | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [unitId,           setUnitId]           = useState<string | null>(null);
  const [activeTab,        setActiveTab]        = useState<"assessments" | "history" | "reminders">("assessments");

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

      {/* Board policy panel */}
      <PolicyPanel />
    </div>
  );
}

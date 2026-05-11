import { useEffect, useState } from "react";
import { getAssessmentsForUnit, getTotalOutstandingCents, type Assessment } from "@/services/treasury";
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
  return "Assessment";
}

export default function TreasuryPage() {
  const [assessments,      setAssessments]      = useState<Assessment[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState<bigint | null>(null);
  const [loading,          setLoading]          = useState(true);

  useEffect(() => {
    getMyProfile().then((member) => {
      if (!member) { setLoading(false); return; }
      Promise.all([
        getAssessmentsForUnit(member.unitId),
        getTotalOutstandingCents(),
      ]).then(([asmt, total]) => {
        setAssessments(asmt);
        setTotalOutstanding(total);
      }).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading treasury…</p>;

  const outstanding = assessments.filter((a) => "Outstanding" in a.status);

  return (
    <div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Treasury</h1>
      <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "2rem" }}>
        Dues, assessments, and payment history
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
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
      </div>

      {assessments.length === 0 ? (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO ASSESSMENTS
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {assessments.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                  {kindLabel(a.kind)}
                </div>
                <div style={{ fontFamily: S.sans, fontSize: "0.9rem" }}>{a.description}</div>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.2rem" }}>
                  Due {new Date(Number(a.dueDate) / 1_000_000).toLocaleDateString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.25rem" }}>{centsToDisplay(a.amountCents)}</div>
                <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: statusColor(a.status), textTransform: "uppercase" }}>
                  {statusLabel(a.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

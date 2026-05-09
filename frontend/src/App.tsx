import { useState } from "react";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F9F6F0",
  rule:     "#C8C3B8",
  navy:     "#1B2D4F",
  sage:     "#5A8C58",
  sageText: "#3A6638",
  amber:    "#D4860A",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
};

type Tab = "dashboard" | "proposals" | "treasury" | "documents" | "announcements";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: S.paper }}>
      <header style={{
        borderBottom: `1px solid ${S.rule}`,
        padding: "0 2rem",
        display: "flex",
        alignItems: "center",
        gap: "2rem",
        height: 56,
        background: S.navy,
        color: S.paper,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.8rem", letterSpacing: "0.12em", fontWeight: 700 }}>
          QUORUM
        </span>
        <nav style={{ display: "flex", gap: "1.5rem", marginLeft: "auto" }}>
          {(["dashboard", "proposals", "treasury", "documents", "announcements"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                color: tab === t ? S.paper : S.inkLight,
                fontFamily: S.mono,
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                padding: "0 0 2px",
                borderBottom: tab === t ? `1px solid ${S.paper}` : "1px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, padding: "2.5rem 2rem", maxWidth: 960, margin: "0 auto", width: "100%" }}>
        {tab === "dashboard"     && <Dashboard />}
        {tab === "proposals"     && <Placeholder title="Proposals" description="Active votes and governance history" />}
        {tab === "treasury"      && <Placeholder title="Treasury"  description="Dues, assessments, and financial records" />}
        {tab === "documents"     && <Placeholder title="Documents" description="CC&Rs, bylaws, meeting minutes, and budgets" />}
        {tab === "announcements" && <Placeholder title="Announcements" description="Community notices and alerts" />}
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div>
      <h1 style={{ fontFamily: "'Georgia', serif", fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>
        Good morning, Homeowner.
      </h1>
      <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "2rem" }}>
        Your community at a glance.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {[
          { label: "Open Proposals",     value: "2"     },
          { label: "Outstanding Dues",   value: "$0.00" },
          { label: "Unread Notices",     value: "1"     },
        ].map((card) => (
          <div key={card.label} style={{
            border: `1px solid ${S.rule}`,
            padding: "1.5rem",
            background: "#fff",
          }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.5rem" }}>
              {card.label}
            </div>
            <div style={{ fontFamily: "'Georgia', serif", fontSize: "2rem", fontWeight: 700 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 style={{ fontFamily: "'Georgia', serif", fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>
        {title}
      </h1>
      <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem" }}>{description}</p>
      <div style={{ marginTop: "2rem", padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
        COMING SOON
      </div>
    </div>
  );
}

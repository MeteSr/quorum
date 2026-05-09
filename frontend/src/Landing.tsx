import { useState } from "react";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F9F6F0",
  rule:     "#C8C3B8",
  navy:     "#1B2D4F",
  navyDark: "#131F37",
  sage:     "#5A8C58",
  sageText: "#3A6638",
  amber:    "#D4860A",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: string }) {
  return (
    <span style={{
      fontFamily: S.mono,
      fontSize: "0.62rem",
      letterSpacing: "0.12em",
      textTransform: "uppercase" as const,
      color: S.inkLight,
    }}>
      {children}
    </span>
  );
}

function SageLabel({ children }: { children: string }) {
  return (
    <span style={{
      fontFamily: S.mono,
      fontSize: "0.62rem",
      letterSpacing: "0.12em",
      textTransform: "uppercase" as const,
      color: S.sage,
    }}>
      {children}
    </span>
  );
}

// ─── Feature card data ────────────────────────────────────────────────────────

const FEATURES = [
  {
    label: "Governance",
    title: "On-chain proposals & voting",
    body:  "Every motion, amendment, and vote is recorded permanently on the Internet Computer. No paper ballots, no disputes about counts.",
  },
  {
    label: "Treasury",
    title: "Transparent dues & assessments",
    body:  "Monthly dues, special assessments, fines — every dollar posted and settled on-chain. Every member sees the same ledger.",
  },
  {
    label: "Documents",
    title: "Immutable document vault",
    body:  "CC&Rs, bylaws, meeting minutes, and budgets stored on-chain. No version conflicts. No lost files. Accessible to every member forever.",
  },
  {
    label: "Announcements",
    title: "Board-to-community notices",
    body:  "Post urgent alerts or routine notices with expiry dates. Members always see the current, authoritative version.",
  },
  {
    label: "Membership",
    title: "Invite-code onboarding",
    body:  "The board controls who enters. Generate time-limited or single-use invite codes. Unit assignments and roles managed on-chain.",
  },
  {
    label: "Security",
    title: "No central point of failure",
    body:  "Built on the Internet Computer — no AWS, no database, no vendor lock-in. Your HOA data is owned by your community, not a SaaS company.",
  },
];

const STEPS = [
  { n: "01", title: "Board deploys Quorum",   body: "Set up your community profile, unit count, and initial board roles in minutes." },
  { n: "02", title: "Generate invite codes",  body: "Issue codes to homeowners — scoped by use count and expiry. No public sign-ups." },
  { n: "03", title: "Members register",       body: "Homeowners claim their unit and role on-chain with their Internet Identity." },
  { n: "04", title: "Govern on-chain",        body: "Post proposals, collect votes, post assessments, archive minutes — all transparent, all permanent." },
];

// ─── Landing page ─────────────────────────────────────────────────────────────

interface Props {
  onLogin: () => void;
}

export default function Landing({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  }

  return (
    <div style={{ background: S.paper, color: S.ink, fontFamily: S.sans }}>

      {/* ── Nav ── */}
      <header style={{
        background: S.navy,
        borderBottom: `1px solid ${S.navyDark}`,
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: "0 2rem",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <span style={{
          fontFamily: S.mono,
          fontSize: "0.85rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "#fff",
          textTransform: "uppercase",
        }}>
          QUORUM
        </span>

        <nav style={{ display: "flex", gap: "2rem", marginLeft: "3rem" }}>
          {["Features", "How it works", "Pricing"].map((t) => (
            <a key={t} href={`#${t.toLowerCase().replace(/ /g, "-")}`} style={{
              fontFamily: S.mono,
              fontSize: "0.62rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
              textDecoration: "none",
            }}>
              {t}
            </a>
          ))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", gap: "1rem", alignItems: "center" }}>
          <button onClick={onLogin} style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "rgba(255,255,255,0.8)",
            fontFamily: S.mono,
            fontSize: "0.62rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0.4rem 1rem",
            cursor: "pointer",
          }}>
            Log in
          </button>
          <button onClick={onLogin} style={{
            background: S.sage,
            border: "none",
            color: "#fff",
            fontFamily: S.mono,
            fontSize: "0.62rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0.4rem 1rem",
            cursor: "pointer",
            fontWeight: 600,
          }}>
            Get started
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{
        background: S.navy,
        padding: "6rem 2rem 5rem",
        textAlign: "center",
        borderBottom: `1px solid ${S.navyDark}`,
      }}>
        <SageLabel>Homeowners Association · On the Internet Computer</SageLabel>

        <h1 style={{
          fontFamily: S.serif,
          fontSize: "clamp(2.4rem, 6vw, 4.2rem)",
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.1,
          margin: "1.25rem auto 0",
          maxWidth: 760,
          letterSpacing: "-0.02em",
        }}>
          Your community,<br />governed on-chain.
        </h1>

        <p style={{
          fontFamily: S.sans,
          fontSize: "1.05rem",
          fontWeight: 300,
          color: "rgba(255,255,255,0.65)",
          margin: "1.5rem auto 0",
          maxWidth: 560,
          lineHeight: 1.65,
        }}>
          Quorum replaces paper ballots, spreadsheet ledgers, and email threads
          with immutable on-chain governance — proposals, votes, dues, and
          documents your whole HOA can trust.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2.5rem" }}>
          <button onClick={onLogin} style={{
            background: S.sage,
            border: "none",
            color: "#fff",
            fontFamily: S.mono,
            fontSize: "0.7rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0.8rem 2rem",
            cursor: "pointer",
            fontWeight: 600,
          }}>
            Request early access
          </button>
          <a href="#how-it-works" style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "rgba(255,255,255,0.75)",
            fontFamily: S.mono,
            fontSize: "0.7rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0.8rem 2rem",
            cursor: "pointer",
            textDecoration: "none",
            display: "inline-block",
          }}>
            See how it works
          </a>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section style={{
        borderBottom: `1px solid ${S.rule}`,
        padding: "2.5rem 2rem",
        display: "flex",
        justifyContent: "center",
        gap: "4rem",
        flexWrap: "wrap" as const,
      }}>
        {[
          { stat: "100%",    label: "On-chain data" },
          { stat: "5",       label: "Canister modules" },
          { stat: "∞",       label: "Audit history" },
          { stat: "No SQL",  label: "No single point of failure" },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: S.serif,
              fontSize: "2.2rem",
              fontWeight: 900,
              color: S.navy,
              lineHeight: 1,
            }}>
              {item.stat}
            </div>
            <div style={{ marginTop: "0.4rem" }}>
              <Label>{item.label}</Label>
            </div>
          </div>
        ))}
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ padding: "5rem 2rem", maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ marginBottom: "3rem" }}>
          <Label>Platform features</Label>
          <h2 style={{
            fontFamily: S.serif,
            fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
            fontWeight: 900,
            marginTop: "0.5rem",
            letterSpacing: "-0.02em",
          }}>
            Everything your HOA needs.<br />Nothing it doesn't.
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1px",
          border: `1px solid ${S.rule}`,
          background: S.rule,
        }}>
          {FEATURES.map((f) => (
            <div key={f.label} style={{
              background: S.paper,
              padding: "2rem",
            }}>
              <SageLabel>{f.label}</SageLabel>
              <h3 style={{
                fontFamily: S.serif,
                fontSize: "1.15rem",
                fontWeight: 700,
                margin: "0.6rem 0 0.75rem",
              }}>
                {f.title}
              </h3>
              <p style={{
                fontFamily: S.sans,
                fontSize: "0.88rem",
                fontWeight: 300,
                color: S.inkLight,
                lineHeight: 1.65,
              }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" style={{
        borderTop: `1px solid ${S.rule}`,
        borderBottom: `1px solid ${S.rule}`,
        padding: "5rem 2rem",
        background: "#fff",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <Label>How it works</Label>
          <h2 style={{
            fontFamily: S.serif,
            fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
            fontWeight: 900,
            marginTop: "0.5rem",
            marginBottom: "3rem",
            letterSpacing: "-0.02em",
          }}>
            Live on-chain in an afternoon.
          </h2>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: "0" }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{
                display: "grid",
                gridTemplateColumns: "4rem 1fr",
                gap: "1.5rem",
                padding: "2rem 0",
                borderBottom: i < STEPS.length - 1 ? `1px solid ${S.rule}` : "none",
              }}>
                <div style={{
                  fontFamily: S.mono,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: S.navy,
                  opacity: 0.35,
                  lineHeight: 1,
                  paddingTop: "0.15rem",
                }}>
                  {s.n}
                </div>
                <div>
                  <h3 style={{
                    fontFamily: S.serif,
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    marginBottom: "0.4rem",
                  }}>
                    {s.title}
                  </h3>
                  <p style={{
                    fontFamily: S.sans,
                    fontSize: "0.9rem",
                    fontWeight: 300,
                    color: S.inkLight,
                    lineHeight: 1.6,
                  }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ padding: "5rem 2rem", maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ marginBottom: "3rem" }}>
          <Label>Pricing</Label>
          <h2 style={{
            fontFamily: S.serif,
            fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
            fontWeight: 900,
            marginTop: "0.5rem",
            letterSpacing: "-0.02em",
          }}>
            One community. One price.
          </h2>
          <p style={{
            fontFamily: S.sans,
            fontSize: "0.95rem",
            fontWeight: 300,
            color: S.inkLight,
            marginTop: "0.5rem",
          }}>
            No per-seat pricing. No feature gating. One flat fee covers your entire HOA.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}>
          {[
            {
              tier:  "Starter",
              price: "$49",
              per:   "per community / month",
              features: ["Up to 50 units", "Governance & voting", "Treasury & dues", "Document vault", "Announcements"],
              cta:   "Get started",
              highlight: false,
            },
            {
              tier:  "Community",
              price: "$99",
              per:   "per community / month",
              features: ["Up to 250 units", "Everything in Starter", "Priority support", "Custom domain", "Audit export"],
              cta:   "Get started",
              highlight: true,
            },
            {
              tier:  "Enterprise",
              price: "Custom",
              per:   "contact us",
              features: ["Unlimited units", "White-labelling", "Dedicated canister", "SLA", "Onboarding support"],
              cta:   "Contact us",
              highlight: false,
            },
          ].map((plan) => (
            <div key={plan.tier} style={{
              border: plan.highlight ? `2px solid ${S.navy}` : `1px solid ${S.rule}`,
              padding: "2rem",
              background: plan.highlight ? S.navy : S.paper,
              position: "relative" as const,
            }}>
              {plan.highlight && (
                <div style={{
                  position: "absolute" as const,
                  top: "-1px",
                  left: "2rem",
                  background: S.sage,
                  padding: "0.2rem 0.75rem",
                  fontFamily: S.mono,
                  fontSize: "0.58rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: "#fff",
                }}>
                  Most popular
                </div>
              )}
              <div style={{
                fontFamily: S.mono,
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                color: plan.highlight ? "rgba(255,255,255,0.5)" : S.inkLight,
                marginBottom: "0.75rem",
              }}>
                {plan.tier}
              </div>
              <div style={{
                fontFamily: S.serif,
                fontSize: "2.4rem",
                fontWeight: 900,
                color: plan.highlight ? "#fff" : S.ink,
                lineHeight: 1,
              }}>
                {plan.price}
              </div>
              <div style={{
                fontFamily: S.mono,
                fontSize: "0.6rem",
                color: plan.highlight ? "rgba(255,255,255,0.4)" : S.inkLight,
                marginTop: "0.25rem",
                marginBottom: "1.5rem",
                letterSpacing: "0.08em",
              }}>
                {plan.per}
              </div>
              <ul style={{ listStyle: "none", marginBottom: "2rem" }}>
                {plan.features.map((f) => (
                  <li key={f} style={{
                    fontFamily: S.sans,
                    fontSize: "0.88rem",
                    fontWeight: 300,
                    color: plan.highlight ? "rgba(255,255,255,0.75)" : S.inkLight,
                    padding: "0.45rem 0",
                    borderBottom: `1px solid ${plan.highlight ? "rgba(255,255,255,0.1)" : S.rule}`,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}>
                    <span style={{ color: S.sage, fontSize: "0.75rem" }}>▸</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={onLogin} style={{
                width: "100%",
                padding: "0.75rem",
                background: plan.highlight ? S.sage : "transparent",
                border: plan.highlight ? "none" : `1px solid ${S.rule}`,
                color: plan.highlight ? "#fff" : S.ink,
                fontFamily: S.mono,
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                cursor: "pointer",
                fontWeight: 600,
              }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Waitlist CTA ── */}
      <section style={{
        background: S.navy,
        borderTop: `1px solid ${S.navyDark}`,
        padding: "5rem 2rem",
        textAlign: "center",
      }}>
        <SageLabel>Early access</SageLabel>
        <h2 style={{
          fontFamily: S.serif,
          fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
          fontWeight: 900,
          color: "#fff",
          marginTop: "0.75rem",
          letterSpacing: "-0.02em",
          maxWidth: 560,
          margin: "0.75rem auto 0",
        }}>
          Be among the first HOAs on-chain.
        </h2>
        <p style={{
          fontFamily: S.sans,
          fontSize: "0.95rem",
          fontWeight: 300,
          color: "rgba(255,255,255,0.55)",
          margin: "1rem auto 2rem",
          maxWidth: 420,
          lineHeight: 1.6,
        }}>
          We're onboarding communities one by one. Leave your email and we'll
          reach out when your spot is ready.
        </p>

        {submitted ? (
          <div style={{
            fontFamily: S.mono,
            fontSize: "0.75rem",
            letterSpacing: "0.1em",
            color: S.sage,
            textTransform: "uppercase",
          }}>
            ✓ You're on the list — we'll be in touch.
          </div>
        ) : (
          <form onSubmit={handleWaitlist} style={{
            display: "flex",
            gap: "0",
            maxWidth: 420,
            margin: "0 auto",
          }}>
            <input
              type="email"
              required
              placeholder="board@yourhoa.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRight: "none",
                color: "#fff",
                fontFamily: S.sans,
                fontSize: "0.9rem",
                outline: "none",
              }}
            />
            <button type="submit" style={{
              background: S.sage,
              border: "none",
              color: "#fff",
              fontFamily: S.mono,
              fontSize: "0.62rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.75rem 1.25rem",
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap" as const,
            }}>
              Join waitlist
            </button>
          </form>
        )}
      </section>

      {/* ── Footer ── */}
      <footer style={{
        background: S.navyDark,
        borderTop: `1px solid rgba(255,255,255,0.05)`,
        padding: "2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap" as const,
        gap: "1rem",
      }}>
        <span style={{
          fontFamily: S.mono,
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
        }}>
          QUORUM
        </span>
        <span style={{
          fontFamily: S.mono,
          fontSize: "0.6rem",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.2)",
        }}>
          Built on the Internet Computer · © {new Date().getFullYear()} Quorum
        </span>
      </footer>

    </div>
  );
}

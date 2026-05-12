import { useEffect, useState } from "react";
import { generateCoupon, getCoupon, type CouponRecord } from "@/services/benefit";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F4F1EB",
  rule:     "#C8C3B8",
  rust:     "#C94C2E",
  navy:     "#1B2D4F",
  inkLight: "#7A7268",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

const FEATURES = [
  { label: "Property maintenance records",   desc: "Document every repair, upgrade, and inspection with dual-signature verification." },
  { label: "Verified job history",            desc: "Contractor work is signed on-chain — unforgeable proof for buyers and lenders." },
  { label: "FSBO listing tools",             desc: "List your home without an agent. Sealed bids, 360° tours, and offer management." },
];

const FAQ = [
  { q: "Is it stackable with HomeGentic promos?",    a: "No — the Quorum member discount cannot be combined with other promotional codes." },
  { q: "How long is my code valid?",                 a: "12 months from the date issued. It is automatically re-issued at your Quorum renewal." },
  { q: "Which HomeGentic plans qualify?",            a: "Basic ($10/mo), Pro ($20/mo), and Premium ($40/mo) — all paid tiers." },
];

export default function MemberBenefitsPage() {
  const [coupon,   setCoupon]   = useState<CouponRecord | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error,    setError]    = useState("");
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    getCoupon().then(c => { setCoupon(c); setLoading(false); });
  }, []);

  async function handleClaim() {
    setClaiming(true); setError("");
    const r = await generateCoupon();
    if ("ok" in r) {
      setCoupon(r.ok);
    } else {
      setError("Not authorized. You must be a verified HOA member.");
    }
    setClaiming(false);
  }

  function copyCode() {
    if (!coupon) return;
    navigator.clipboard.writeText(coupon.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Hero */}
      <div style={{ borderBottom: `1px solid ${S.rule}`, paddingBottom: "2rem", marginBottom: "2.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.15em", color: S.rust, marginBottom: "0.5rem" }}>
          Member Benefit
        </div>
        <h1 style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 900, marginBottom: "0.75rem" }}>
          Save 10% on HomeGentic
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "1rem", color: S.inkLight, lineHeight: 1.6, maxWidth: 520 }}>
          As a Quorum HOA member you receive a 10% discount on any HomeGentic paid plan — the property intelligence platform that turns your home's history into verified equity.
        </p>
      </div>

      {/* What is HomeGentic */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.inkLight, marginBottom: "1rem" }}>
          What is HomeGentic?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <div style={{ width: 6, height: 6, background: S.rust, flexShrink: 0, marginTop: 7 }} />
              <div>
                <div style={{ fontFamily: S.sans, fontWeight: 500, fontSize: "0.9rem" }}>{f.label}</div>
                <div style={{ fontFamily: S.sans, fontSize: "0.82rem", color: S.inkLight, marginTop: 2 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Redemption flow */}
      <section style={{ marginBottom: "2.5rem", background: "white", border: `1px solid ${S.rule}`, padding: "1.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.inkLight, marginBottom: "1.25rem" }}>
          How to redeem
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[
            "Claim your unique discount code below.",
            "Visit HomeGentic and choose a paid plan.",
            "Enter your code at checkout — 10% off applied instantly.",
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <div style={{
                width: 22, height: 22, background: S.navy, color: "white",
                fontFamily: S.mono, fontSize: "0.65rem", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>{i + 1}</div>
              <span style={{ fontFamily: S.sans, fontSize: "0.88rem", paddingTop: 2 }}>{step}</span>
            </div>
          ))}
        </div>

        {/* Coupon area */}
        {loading ? (
          <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>Loading…</div>
        ) : coupon ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight }}>
                Your discount code
              </div>
              {coupon.redeemedAt.length > 0 && (
                <div style={{
                  fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
                  textTransform: "uppercase", background: S.navy, color: "white",
                  padding: "0.2rem 0.5rem",
                }}>
                  Redeemed
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <div style={{
                fontFamily: S.mono, fontSize: "1.25rem", letterSpacing: "0.12em",
                background: "#F4F1EB", border: `1px solid ${S.rule}`,
                padding: "0.5rem 1.25rem", color: coupon.redeemedAt.length > 0 ? S.inkLight : S.ink,
                textDecoration: coupon.redeemedAt.length > 0 ? "line-through" : "none",
              }}>
                {coupon.code}
              </div>
              {coupon.redeemedAt.length === 0 && (
                <button
                  onClick={copyCode}
                  style={{
                    background: copied ? S.rust : "white", color: copied ? "white" : S.ink,
                    border: `1px solid ${S.rule}`, fontFamily: S.mono,
                    fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase",
                    padding: "0.5rem 0.9rem", cursor: "pointer", minHeight: 44,
                    transition: "background 0.15s",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
            <div style={{ fontFamily: S.sans, fontSize: "0.75rem", color: S.inkLight, marginTop: "0.5rem" }}>
              {coupon.redeemedAt.length > 0
                ? "This code has been redeemed. Contact your HOA board if you need a replacement."
                : "Valid for 12 months · Unique to your account · Non-transferable"}
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={handleClaim}
              disabled={claiming}
              style={{
                background: S.rust, color: "white", border: "none",
                fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
                textTransform: "uppercase", padding: "0.65rem 1.5rem",
                cursor: claiming ? "wait" : "pointer", minHeight: 44,
              }}
            >
              {claiming ? "Generating…" : "Get my discount code"}
            </button>
            {error && (
              <div style={{ marginTop: "0.5rem", fontFamily: S.sans, fontSize: "0.8rem", color: S.rust }}>
                {error}
              </div>
            )}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.inkLight, marginBottom: "1rem" }}>
          FAQ
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ borderTop: `1px solid ${S.rule}`, padding: "0.85rem 0" }}>
              <div style={{ fontFamily: S.sans, fontWeight: 500, fontSize: "0.88rem", marginBottom: "0.3rem" }}>{item.q}</div>
              <div style={{ fontFamily: S.sans, fontSize: "0.82rem", color: S.inkLight }}>{item.a}</div>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${S.rule}` }} />
        </div>
      </section>
    </div>
  );
}

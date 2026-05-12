import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getShareLink, getAllMembers, getCommunityProfile, type ShareLink } from "@/services/members";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F4F1EB",
  rule:     "#C8C3B8",
  navy:     "#1B2D4F",
  rust:     "#C94C2E",
  inkLight: "#7A7268",
  green:    "#2E7D32",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

type Status = "loading" | "invalid" | "expired" | "ok";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `1px solid ${S.rule}`, padding: "1.25rem 1.5rem", background: "white" }}>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.serif, fontSize: "1.6rem", fontWeight: 700, color: S.ink }}>
        {value}
      </div>
    </div>
  );
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [status,    setStatus]    = useState<Status>("loading");
  const [link,      setLink]      = useState<ShareLink | null>(null);
  const [community, setCommunity] = useState<{ name: string; address: string; totalUnits: bigint; description: string } | null>(null);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    (async () => {
      const result = await getShareLink(token);
      if ("err" in result) {
        setStatus("expired");
        return;
      }
      setLink(result.ok);

      // Load community data to display in the view.
      const [profile, members] = await Promise.all([
        getCommunityProfile(),
        getAllMembers(),
      ]);
      setCommunity(profile);
      setMemberCount(members.filter(m => m.isActive).length);
      setStatus("ok");
    })();
  }, [token]);

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.paper }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight }}>Loading shared view…</span>
      </div>
    );
  }

  if (status === "invalid" || status === "expired") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.paper }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.rust, marginBottom: 12 }}>
            Link unavailable
          </div>
          <h1 style={{ fontFamily: S.serif, fontSize: "1.6rem", fontWeight: 700, marginBottom: 12 }}>
            {status === "expired" ? "This link has expired or been revoked." : "Invalid share link."}
          </h1>
          <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>
            Ask the board to generate a new link, or{" "}
            <a href="/" style={{ color: S.navy }}>sign in to Quorum</a>.
          </p>
        </div>
      </div>
    );
  }

  const isDemo = link && "Demo" in link.scope;
  const communityName = community?.name ?? "This Community";

  return (
    <div style={{ minHeight: "100vh", background: S.paper }}>
      {/* Read-only banner */}
      <div style={{ background: S.navy, color: "white", padding: "0.6rem 2rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          QUORUM
        </span>
        <span style={{ fontFamily: S.sans, fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", marginLeft: "auto" }}>
          {isDemo ? "Demo snapshot — names and balances anonymized" : "Audit read-only view — shared by the board"}
        </span>
        <a href="/" style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>
          Sign in →
        </a>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "3rem 2rem" }}>
        {/* Header */}
        <div style={{ borderBottom: `2px solid ${S.ink}`, paddingBottom: "1.5rem", marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.rust, marginBottom: 8 }}>
            {isDemo ? "Community Preview" : "Audit View"}
          </div>
          <h1 style={{ fontFamily: S.serif, fontSize: "2.25rem", fontWeight: 900, margin: 0 }}>
            {communityName}
          </h1>
          {community?.address && (
            <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight, marginTop: 6 }}>
              {community.address}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: "2.5rem" }}>
          <StatCard label="Total Units"   value={community ? String(community.totalUnits) : "—"} />
          <StatCard label="Active Members" value={String(memberCount)} />
          <StatCard label="View Mode"     value={isDemo ? "Demo" : "Audit"} />
        </div>

        {/* Description */}
        {community?.description && (
          <section style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: 12 }}>
              About this community
            </div>
            <p style={{ fontFamily: S.sans, fontSize: "0.95rem", lineHeight: 1.65, color: S.ink }}>
              {community.description}
            </p>
          </section>
        )}

        {/* Demo mode notice */}
        {isDemo && (
          <div style={{ border: `1px solid ${S.rule}`, background: "white", padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: 8 }}>
              Demo mode
            </div>
            <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight, margin: 0 }}>
              Member names and financial balances are anonymized in this view. Request an Audit link from the board for full access.
            </p>
          </div>
        )}

        {/* CTA */}
        <div style={{ borderTop: `1px solid ${S.rule}`, paddingTop: "2rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <a href="/" style={{
            display: "inline-block", background: S.rust, color: "white",
            fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
            textTransform: "uppercase", padding: "0.65rem 1.5rem",
            textDecoration: "none",
          }}>
            Sign in to Quorum
          </a>
          <span style={{ fontFamily: S.sans, fontSize: "0.82rem", color: S.inkLight }}>
            This link expires {link?.expiresAt && link.expiresAt.length > 0
              ? new Date(Number(link.expiresAt[0]!) / 1_000_000).toLocaleDateString()
              : "7 days after creation"}.
          </span>
        </div>
      </div>
    </div>
  );
}

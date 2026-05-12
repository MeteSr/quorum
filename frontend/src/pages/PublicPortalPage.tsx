import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPublicProfile, type PublicProfile, type PageBlock } from "@/services/members";
import { getPublicAnnouncements, type Announcement } from "@/services/announcements";

const S = {
  paper:    "#F9F6F0",
  ink:      "#0E0E0C",
  inkLight: "#7A7268",
  rule:     "#C8C3B8",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

function formatDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function PageBlockRenderer({ block, accent }: { block: PageBlock; accent: string }) {
  if ("Text" in block) {
    return (
      <p style={{ fontFamily: S.sans, fontSize: "1rem", color: S.ink, lineHeight: 1.7, margin: "1rem 0" }}>
        {block.Text}
      </p>
    );
  }
  if ("AnnouncementFeed" in block) {
    return null; // rendered separately below
  }
  if ("ContactForm" in block) {
    return (
      <div style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", margin: "1rem 0" }}>
        <p style={{ fontFamily: S.mono, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.75rem" }}>
          Contact the Board
        </p>
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>
          Contact form available to registered members. Please log in to send a message.
        </p>
      </div>
    );
  }
  return null;
}

function AnnouncementCard({ ann }: { ann: Announcement }) {
  const isUrgent = "Urgent" in ann.priority;
  return (
    <div style={{
      borderLeft: `3px solid ${isUrgent ? "#C94C2E" : S.rule}`,
      paddingLeft: "1rem", marginBottom: "1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.25rem" }}>
        <span style={{ fontFamily: S.serif, fontSize: "1rem", fontWeight: 700, color: S.ink }}>
          {ann.title}
        </span>
        {isUrgent && (
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#C94C2E" }}>
            Urgent
          </span>
        )}
      </div>
      <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight, margin: "0 0 0.25rem" }}>
        {ann.body}
      </p>
      <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.rule }}>
        {formatDate(ann.postedAt)}
      </span>
    </div>
  );
}

export default function PublicPortalPage() {
  const navigate = useNavigate();
  const [profile, setProfile]     = useState<PublicProfile | null>(null);
  const [anns, setAnns]           = useState<Announcement[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([getPublicProfile(), getPublicAnnouncements()])
      .then(([p, a]) => { setProfile(p); setAnns(a); })
      .finally(() => setLoading(false));
  }, []);

  const accent = profile?.accentColor ?? "#1B2D4F";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: S.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight, letterSpacing: "0.1em" }}>
          LOADING…
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ minHeight: "100vh", background: S.paper, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <span style={{ fontFamily: S.serif, fontSize: "1.5rem", color: S.ink }}>Community portal not configured</span>
        <p style={{ fontFamily: S.sans, color: S.inkLight }}>
          This community's public portal has not been set up yet.
        </p>
        <button
          onClick={() => navigate("/")}
          style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0.5rem 1rem", border: `1px solid ${S.rule}`, background: "none", cursor: "pointer", color: S.inkLight }}
        >
          Member Login →
        </button>
      </div>
    );
  }

  const hasAnnouncementFeedBlock = profile.pageBlocks.some(b => "AnnouncementFeed" in b);

  return (
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ background: accent, color: S.paper, padding: "1.5rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: S.serif, fontSize: "1.5rem", fontWeight: 900, margin: 0, letterSpacing: "-0.01em" }}>
            {profile.name}
          </h1>
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", opacity: 0.7, letterSpacing: "0.08em" }}>
            {profile.address}
          </span>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em",
            padding: "0.5rem 1.25rem", border: "1px solid rgba(255,255,255,0.4)",
            background: "none", color: S.paper, cursor: "pointer",
          }}
        >
          Member Login →
        </button>
      </header>

      {/* Body */}
      <main style={{ flex: 1, maxWidth: 720, width: "100%", margin: "0 auto", padding: "2.5rem 1.5rem" }}>

        {/* Community stats strip */}
        <div style={{ display: "flex", gap: "2.5rem", borderBottom: `1px solid ${S.rule}`, paddingBottom: "1.5rem", marginBottom: "2rem" }}>
          {[
            { label: "Units",   value: profile.totalUnits.toString() },
            { label: "Members", value: profile.memberCount.toString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, display: "block" }}>{label}</span>
              <span style={{ fontFamily: S.serif, fontSize: "1.5rem", fontWeight: 700, color: S.ink }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Description */}
        {profile.description && (
          <p style={{ fontFamily: S.sans, fontSize: "1rem", color: S.ink, lineHeight: 1.7, marginBottom: "2rem" }}>
            {profile.description}
          </p>
        )}

        {/* Page builder blocks (excluding AnnouncementFeed — rendered below) */}
        {profile.pageBlocks.filter(b => !("AnnouncementFeed" in b)).map((block, i) => (
          <PageBlockRenderer key={i} block={block} accent={accent} />
        ))}

        {/* Pay Dues CTA */}
        <div style={{ display: "flex", gap: "1rem", margin: "2rem 0", flexWrap: "wrap" }}>
          <a
            href="/?pay-dues=1"
            style={{
              fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em",
              padding: "0.65rem 1.5rem", background: accent, color: S.paper, textDecoration: "none",
              border: "none", cursor: "pointer",
            }}
          >
            Pay Dues →
          </a>
          <button
            onClick={() => navigate("/")}
            style={{
              fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em",
              padding: "0.65rem 1.5rem", background: "none", color: S.ink, cursor: "pointer",
              border: `1px solid ${S.rule}`,
            }}
          >
            Member Login →
          </button>
        </div>

        {/* Announcements */}
        {(hasAnnouncementFeedBlock || anns.length > 0) && (
          <section style={{ marginTop: "2.5rem", borderTop: `1px solid ${S.rule}`, paddingTop: "2rem" }}>
            <h2 style={{ fontFamily: S.serif, fontSize: "1.25rem", fontWeight: 700, color: S.ink, marginBottom: "1.5rem" }}>
              Announcements
            </h2>
            {anns.length === 0 ? (
              <p style={{ fontFamily: S.sans, color: S.inkLight, fontSize: "0.9rem" }}>No public announcements at this time.</p>
            ) : (
              anns.map(ann => <AnnouncementCard key={ann.id} ann={ann} />)
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${S.rule}`, padding: "1rem 2rem", display: "flex", justifyContent: "center" }}>
        <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.rule, letterSpacing: "0.08em" }}>
          Powered by Quorum — HOA management on ICP
        </span>
      </footer>
    </div>
  );
}

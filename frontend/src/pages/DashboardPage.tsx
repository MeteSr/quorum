import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { getCommunityProfile, getMyProfile, type Member, type CommunityProfile } from "@/services/members";
import { getOpenProposals } from "@/services/governance";
import { getAssessmentsForUnit } from "@/services/treasury";
import { getActive } from "@/services/announcements";

const S = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  sage:     "#5A8C58",
  amber:    "#D4860A",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function centsToDisplay(cents: bigint): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const { principal } = useAuthStore();
  const [profile,      setProfile]      = useState<Member | null>(null);
  const [community,    setCommunity]    = useState<CommunityProfile | null>(null);
  const [openProposals, setOpenProposals] = useState<number | null>(null);
  const [outstandingCents, setOutstandingCents] = useState<bigint | null>(null);
  const [unreadCount,  setUnreadCount]  = useState<number | null>(null);

  useEffect(() => {
    getCommunityProfile().then(setCommunity).catch(() => {});
    getMyProfile().then((m) => {
      setProfile(m);
      if (m) getAssessmentsForUnit(m.unitId)
        .then((a) => setOutstandingCents(a.filter((x) => "Outstanding" in x.status).reduce((s, x) => s + x.amountCents, BigInt(0))))
        .catch(() => setOutstandingCents(BigInt(0)));
    }).catch(() => {});
    getOpenProposals().then((p) => setOpenProposals(p.length)).catch(() => setOpenProposals(0));
    getActive().then((a) => setUnreadCount(a.length)).catch(() => setUnreadCount(0));
  }, [principal]);

  const name = profile?.displayName?.split(" ")[0] ?? "Homeowner";

  return (
    <div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>
        {greeting()}, {name}.
      </h1>
      {community && (
        <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "0.25rem" }}>
          {community.name}
        </p>
      )}
      {profile && (
        <p style={{ color: S.inkLight, fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.06em", marginBottom: "2rem" }}>
          Unit {profile.unitId}
        </p>
      )}
      {!profile && (
        <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "2rem" }}>
          Your community at a glance.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {[
          { label: "Open Proposals",   value: openProposals   !== null ? String(openProposals)   : "—", accent: S.navy  },
          { label: "Outstanding Dues", value: outstandingCents !== null ? centsToDisplay(outstandingCents) : "—", accent: outstandingCents ? S.amber : S.sage },
          { label: "Active Notices",   value: unreadCount      !== null ? String(unreadCount)      : "—", accent: S.ink  },
        ].map((card) => (
          <div key={card.label} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em", color: S.inkLight, textTransform: "uppercase", marginBottom: "0.5rem" }}>
              {card.label}
            </div>
            <div style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 700, color: card.accent }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

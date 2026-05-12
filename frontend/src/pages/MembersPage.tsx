import { useEffect, useState } from "react";
import {
  getAllMembers, getMyShareLinks, createShareLink, revokeShareLink,
  resendWelcomePacket, getWebsiteConfig, setCommunitySlug, setCustomDomain,
  setAccentColor, setPageBlocks,
  type Member, type ShareLink, type ShareScope, type WebsiteConfig, type PageBlock,
} from "@/services/members";
import { getWelcomePacketConfig, setWelcomePacketConfig, type WelcomePacketConfig } from "@/services/governance";
import { useAuthStore } from "@/store/authStore";

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

function isBoardRole(member: Member): boolean {
  return (
    "BoardMember"    in member.role ||
    "BoardPresident" in member.role ||
    "Treasurer"      in member.role ||
    "Secretary"      in member.role
  );
}

function roleLabel(member: Member): string {
  if ("BoardPresident"  in member.role) return "Board President";
  if ("BoardMember"     in member.role) return "Board Member";
  if ("Treasurer"       in member.role) return "Treasurer";
  if ("Secretary"       in member.role) return "Secretary";
  if ("PropertyManager" in member.role) return "Property Manager";
  return "Homeowner";
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

function MemberRow({
  member, isBoard, onResend,
}: {
  member: Member;
  isBoard: boolean;
  onResend: (m: Member) => void;
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleResend() {
    setBusy(true);
    await onResend(member);
    setBusy(false);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 80px 160px 120px",
      gap: 12, alignItems: "center",
      padding: "0.75rem 0", borderBottom: `1px solid ${S.rule}`,
    }}>
      <div>
        <div style={{ fontFamily: S.sans, fontSize: "0.88rem", fontWeight: 500 }}>
          {member.displayName}
        </div>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
          Unit {member.unitId} · {member.email}
        </div>
      </div>
      <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase" }}>
        {roleLabel(member)}
      </div>
      <div style={{
        fontFamily: S.mono, fontSize: "0.6rem",
        color: member.isActive ? S.green : S.rust,
        textTransform: "uppercase",
      }}>
        {member.isActive ? "Active" : "Inactive"}
      </div>
      {isBoard && (
        <button
          onClick={handleResend}
          disabled={busy || sent}
          style={{
            background: "none", border: `1px solid ${S.rule}`,
            fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
            textTransform: "uppercase", padding: "0.3rem 0.6rem",
            cursor: busy || sent ? "default" : "pointer",
            color: sent ? S.green : S.inkLight,
          }}
        >
          {sent ? "Sent" : busy ? "Sending…" : "Re-send packet"}
        </button>
      )}
    </div>
  );
}

// ─── ShareLinksPanel ──────────────────────────────────────────────────────────

function ShareLinksPanel() {
  const [links, setLinks]     = useState<ShareLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [scope, setScope]     = useState<"Demo" | "AuditReadOnly">("Demo");
  const [days, setDays]       = useState("7");
  const [busy, setBusy]       = useState(false);
  const [copied, setCopied]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    getMyShareLinks().then(r => {
      if ("ok" in r) setLinks(r.ok);
    });
  }, []);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const daysNum = parseInt(days, 10);
    const expiresAt: [] | [bigint] =
      isNaN(daysNum) || daysNum <= 0
        ? []
        : [BigInt(Date.now()) * BigInt(1_000_000) + BigInt(daysNum) * BigInt(86_400_000_000_000)];
    const scopeVal: ShareScope = scope === "Demo" ? { Demo: null } : { AuditReadOnly: null };
    const result = await createShareLink(scopeVal, expiresAt);
    if ("ok" in result) {
      setLinks(prev => [result.ok, ...prev]);
      setCreating(false);
    } else {
      setError("Could not create link. Are you a board member?");
    }
    setBusy(false);
  }

  async function handleRevoke(token: string) {
    await revokeShareLink(token);
    setLinks(prev => prev.map(l => l.token === token ? { ...l, isRevoked: true } : l));
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(`${ORIGIN}/share/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2500);
  }

  const active   = links.filter(l => !l.isRevoked);
  const revoked  = links.filter(l => l.isRevoked);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight }}>
          Share Links
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          style={{
            background: S.navy, border: "none", color: "white",
            fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
            textTransform: "uppercase", padding: "0.3rem 0.8rem", cursor: "pointer",
          }}
        >
          + New link
        </button>
      </div>

      {creating && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", marginBottom: "1.25rem", background: "white" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontFamily: S.mono, fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
                Scope
              </label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value as "Demo" | "AuditReadOnly")}
                style={{ fontFamily: S.sans, fontSize: "0.85rem", padding: "0.3rem 0.5rem", border: `1px solid ${S.rule}` }}
              >
                <option value="Demo">Demo (anonymized)</option>
                <option value="AuditReadOnly">Audit Read-Only</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: S.mono, fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
                Expires (days)
              </label>
              <input
                type="number" min="1" max="365" value={days}
                onChange={e => setDays(e.target.value)}
                style={{ width: 72, fontFamily: S.sans, fontSize: "0.85rem", padding: "0.3rem 0.5rem", border: `1px solid ${S.rule}` }}
              />
            </div>
            <button
              onClick={handleCreate} disabled={busy}
              style={{
                background: S.rust, border: "none", color: "white",
                fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "0.4rem 1rem", cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setCreating(false)}
              style={{
                background: "none", border: `1px solid ${S.rule}`, color: S.inkLight,
                fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "0.4rem 0.8rem", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          {error && <div style={{ fontFamily: S.sans, fontSize: "0.82rem", color: S.rust, marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {links.length === 0 && !creating && (
        <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight }}>No share links yet.</p>
      )}

      {active.map(link => (
        <div key={link.token} style={{
          display: "grid", gridTemplateColumns: "1fr 80px 80px 120px 80px",
          gap: 12, alignItems: "center",
          padding: "0.65rem 0", borderBottom: `1px solid ${S.rule}`,
        }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.68rem", color: S.ink, wordBreak: "break-all" }}>
            {ORIGIN}/share/{link.token}
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textTransform: "uppercase" }}>
            {"Demo" in link.scope ? "Demo" : "Audit"}
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            {String(link.viewCount)} views
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>
            {link.expiresAt.length > 0
              ? "Expires " + new Date(Number(link.expiresAt[0]!) / 1_000_000).toLocaleDateString()
              : "No expiry"}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => handleCopy(link.token)}
              style={{
                background: "none", border: `1px solid ${S.rule}`,
                fontFamily: S.mono, fontSize: "0.56rem", letterSpacing: "0.06em",
                textTransform: "uppercase", padding: "0.25rem 0.5rem", cursor: "pointer",
                color: copied === link.token ? S.green : S.inkLight,
              }}
            >
              {copied === link.token ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => handleRevoke(link.token)}
              style={{
                background: "none", border: `1px solid ${S.rust}`,
                fontFamily: S.mono, fontSize: "0.56rem", letterSpacing: "0.06em",
                textTransform: "uppercase", padding: "0.25rem 0.5rem", cursor: "pointer",
                color: S.rust,
              }}
            >
              Revoke
            </button>
          </div>
        </div>
      ))}

      {revoked.length > 0 && (
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight, cursor: "pointer" }}>
            {revoked.length} revoked link{revoked.length > 1 ? "s" : ""}
          </summary>
          {revoked.map(link => (
            <div key={link.token} style={{
              fontFamily: S.mono, fontSize: "0.62rem", color: S.inkLight,
              padding: "0.5rem 0", borderBottom: `1px solid ${S.rule}`,
              textDecoration: "line-through",
            }}>
              {link.token} · {"Demo" in link.scope ? "Demo" : "Audit"} · {String(link.viewCount)} views
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

// ─── WelcomePacketForm ────────────────────────────────────────────────────────

function WelcomePacketForm() {
  const [config, setConfig]   = useState<WelcomePacketConfig | null>(null);
  const [docIds, setDocIds]   = useState("");
  const [contact, setContact] = useState("");
  const [amenity, setAmenity] = useState("");
  const [custom, setCustom]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    getWelcomePacketConfig().then(cfg => {
      if (cfg) {
        setConfig(cfg);
        setDocIds(cfg.pinnedDocIds.join(", "));
        setContact(cfg.contactCard);
        setAmenity(cfg.amenityNotes);
        setCustom(cfg.customMessage);
      }
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    const ids = docIds.split(",").map(s => s.trim()).filter(Boolean);
    await setWelcomePacketConfig(ids, contact, amenity, custom);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "1.25rem" }}>
        Welcome Packet Configuration
      </div>
      <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight, marginBottom: "1.25rem" }}>
        This content is emailed to new members automatically when they register.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Pinned Document IDs (comma-separated)
          </label>
          <input
            type="text" value={docIds} onChange={e => setDocIds(e.target.value)}
            placeholder="doc-001, doc-rules, doc-faq"
            style={{ width: "100%", fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}`, boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Contact Card
          </label>
          <textarea
            value={contact} onChange={e => setContact(e.target.value)} rows={3}
            placeholder="Board President: Jane Smith — jane@example.com"
            style={{ width: "100%", fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}`, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Amenity Notes
          </label>
          <textarea
            value={amenity} onChange={e => setAmenity(e.target.value)} rows={3}
            placeholder="Pool hours: 6am–10pm. Gym code: 1234."
            style={{ width: "100%", fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}`, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Custom Message
          </label>
          <textarea
            value={custom} onChange={e => setCustom(e.target.value)} rows={4}
            placeholder="Welcome to the community! We're glad to have you."
            style={{ width: "100%", fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}`, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={handleSave} disabled={saving}
            style={{
              background: S.rust, border: "none", color: "white",
              fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "0.5rem 1.25rem", cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save configuration"}
          </button>
          {saved && (
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.green, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WebsiteSettingsPanel ─────────────────────────────────────────────────────

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

function WebsiteSettingsPanel() {
  const [cfg, setCfg]           = useState<WebsiteConfig | null>(null);
  const [slug, setSlug]         = useState("");
  const [domain, setDomain]     = useState("");
  const [accent, setAccent]     = useState("#1B2D4F");
  const [blockText, setBlockText] = useState("");
  const [saving, setSaving]     = useState<string | null>(null);
  const [saved, setSaved]       = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    getWebsiteConfig().then(r => {
      if ("ok" in r) {
        setCfg(r.ok);
        setSlug(r.ok.slug[0] ?? "");
        setDomain(r.ok.customDomain[0] ?? "");
        setAccent(r.ok.accentColor);
        const textBlocks = r.ok.pageBlocks.filter((b): b is { Text: string } => "Text" in b);
        setBlockText(textBlocks.map(b => b.Text).join("\n\n"));
      }
    });
  }, []);

  async function save(field: string, fn: () => Promise<{ ok: WebsiteConfig } | { err: any }>) {
    setSaving(field);
    setError(null);
    const r = await fn();
    if ("ok" in r) {
      setCfg(r.ok);
      setSaved(field);
      setTimeout(() => setSaved(null), 3000);
    } else {
      const e = r.err;
      setError("InvalidInput" in e ? e.InvalidInput : "Not authorized");
    }
    setSaving(null);
  }

  function buildPageBlocks(): PageBlock[] {
    const blocks: PageBlock[] = [];
    const parts = blockText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) blocks.push({ Text: p });
    blocks.push({ AnnouncementFeed: null });
    return blocks;
  }

  const portalUrl = cfg?.slug[0] ? `${ORIGIN}/portal` : null;

  return (
    <div>
      <div style={{ fontFamily: S.mono, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "1.25rem" }}>
        Community Website
      </div>
      <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight, marginBottom: "1.75rem" }}>
        Configure your public-facing community portal. Board members and residents can access it without logging in.
      </p>

      {error && (
        <div style={{ fontFamily: S.sans, fontSize: "0.82rem", color: S.rust, marginBottom: "1rem", padding: "0.5rem 0.75rem", border: `1px solid ${S.rust}` }}>
          {error}
        </div>
      )}

      {/* Portal link */}
      {portalUrl && (
        <div style={{ padding: "0.75rem 1rem", border: `1px solid ${S.rule}`, marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.68rem", color: S.ink, flex: 1 }}>{portalUrl}</span>
          <a
            href="/portal" target="_blank" rel="noreferrer"
            style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.navy, textDecoration: "none" }}
          >
            Open →
          </a>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Slug */}
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Community Slug
          </label>
          <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.inkLight, margin: "0 0 6px" }}>
            Your portal will be accessible at <strong>{ORIGIN}/portal</strong> (slug reserved for subdomain routing).
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())}
              placeholder="sunset-palms"
              style={{ flex: 1, fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}` }}
            />
            <button
              onClick={() => save("slug", () => setCommunitySlug(slug))}
              disabled={saving === "slug"}
              style={{ background: S.navy, border: "none", color: "white", fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 1rem", cursor: "pointer" }}
            >
              {saving === "slug" ? "Saving…" : saved === "slug" ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Custom domain */}
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Custom Domain
          </label>
          <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.inkLight, margin: "0 0 6px" }}>
            Point a CNAME from your domain to <code style={{ fontFamily: S.mono, fontSize: "0.75rem" }}>icp-api.io</code>, then enter your domain here.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text" value={domain} onChange={e => setDomain(e.target.value)}
              placeholder="www.sunsetpalms.com"
              style={{ flex: 1, fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}` }}
            />
            <button
              onClick={() => save("domain", () => setCustomDomain(domain))}
              disabled={saving === "domain"}
              style={{ background: S.navy, border: "none", color: "white", fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 1rem", cursor: "pointer" }}
            >
              {saving === "domain" ? "Saving…" : saved === "domain" ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Accent color */}
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Accent Color
          </label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="color" value={accent} onChange={e => setAccent(e.target.value)}
              style={{ width: 48, height: 36, border: `1px solid ${S.rule}`, padding: 2, cursor: "pointer" }}
            />
            <input
              type="text" value={accent} onChange={e => setAccent(e.target.value)}
              style={{ width: 100, fontFamily: S.mono, fontSize: "0.82rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}` }}
            />
            <button
              onClick={() => save("accent", () => setAccentColor(accent))}
              disabled={saving === "accent"}
              style={{ background: S.navy, border: "none", color: "white", fontFamily: S.mono, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.4rem 1rem", cursor: "pointer" }}
            >
              {saving === "accent" ? "Saving…" : saved === "accent" ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Page content blocks */}
        <div>
          <label style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Page Content
          </label>
          <p style={{ fontFamily: S.sans, fontSize: "0.78rem", color: S.inkLight, margin: "0 0 6px" }}>
            Enter paragraphs separated by blank lines. Public announcements are shown automatically below.
          </p>
          <textarea
            value={blockText} onChange={e => setBlockText(e.target.value)} rows={6}
            placeholder={"Welcome to Sunset Palms HOA.\n\nWe are a community of 120 homes in Sarasota, FL."}
            style={{ width: "100%", fontFamily: S.sans, fontSize: "0.88rem", padding: "0.4rem 0.6rem", border: `1px solid ${S.rule}`, resize: "vertical", boxSizing: "border-box" }}
          />
          <button
            onClick={() => save("blocks", () => setPageBlocks(buildPageBlocks()))}
            disabled={saving === "blocks"}
            style={{ marginTop: "0.5rem", background: S.rust, border: "none", color: "white", fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.5rem 1.25rem", cursor: "pointer" }}
          >
            {saving === "blocks" ? "Saving…" : saved === "blocks" ? "Saved" : "Save content"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MembersPage ──────────────────────────────────────────────────────────────

type Tab = "members" | "links" | "packet" | "website";

export default function MembersPage() {
  const { principal } = useAuthStore();
  const [members, setMembers]   = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>("members");

  const currentMember = members.find(m => principal && m.principal.toText() === principal);
  const isBoard = currentMember ? isBoardRole(currentMember) : false;

  useEffect(() => {
    getAllMembers().then(ms => {
      setMembers(ms);
      setLoading(false);
    });
  }, []);

  async function handleResend(member: Member) {
    await resendWelcomePacket(member.principal);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "members", label: "Members" },
    { key: "links",   label: "Share Links" },
    { key: "packet",  label: "Welcome Packet" },
    { key: "website", label: "Website" },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ borderBottom: `2px solid ${S.ink}`, paddingBottom: "1rem", marginBottom: "2rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.rust, marginBottom: 6 }}>
          Community
        </div>
        <h1 style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 900, margin: 0 }}>Members</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "2rem", borderBottom: `1px solid ${S.rule}`, marginBottom: "2rem" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none", border: "none",
              fontFamily: S.mono, fontSize: "0.62rem", letterSpacing: "0.1em",
              textTransform: "uppercase", cursor: "pointer",
              color: tab === t.key ? S.ink : S.inkLight,
              borderBottom: tab === t.key ? `2px solid ${S.ink}` : "2px solid transparent",
              padding: "0 0 0.6rem", marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "members" && (
        <div>
          {loading ? (
            <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight }}>Loading members…</p>
          ) : (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 80px 160px 120px",
                gap: 12, padding: "0 0 0.5rem",
                borderBottom: `1px solid ${S.ink}`,
              }}>
                {["Name / Unit", "Role", "Status", ""].map(h => (
                  <div key={h} style={{ fontFamily: S.mono, fontSize: "0.56rem", textTransform: "uppercase", letterSpacing: "0.08em", color: S.inkLight }}>
                    {h}
                  </div>
                ))}
              </div>
              {members.map(m => (
                <MemberRow key={m.principal.toText()} member={m} isBoard={isBoard} onResend={handleResend} />
              ))}
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "1rem" }}>
                {members.filter(m => m.isActive).length} active · {members.length} total
              </p>
            </>
          )}
        </div>
      )}

      {tab === "links" && (
        isBoard
          ? <ShareLinksPanel />
          : <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight }}>Share link management is available to board members only.</p>
      )}

      {tab === "packet" && (
        isBoard
          ? <WelcomePacketForm />
          : <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight }}>Welcome packet configuration is available to board members only.</p>
      )}

      {tab === "website" && (
        isBoard
          ? <WebsiteSettingsPanel />
          : <p style={{ fontFamily: S.sans, fontSize: "0.88rem", color: S.inkLight }}>Website configuration is available to board members only.</p>
      )}
    </div>
  );
}

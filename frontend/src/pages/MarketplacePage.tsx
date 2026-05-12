import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import {
  createListing,
  editListing,
  deleteListing,
  markSold,
  removeListing,
  flagListing,
  getListings,
  getMyListings,
  type Listing,
  type ListingCategory,
  type MarketplaceError,
} from "@/services/marketplace";

const S = {
  ink:      "#0E0E0C",
  rule:     "#C8C3B8",
  rust:     "#C94C2E",
  navy:     "#1B2D4F",
  inkLight: "#7A7268",
  green:    "#2E7D32",
  amber:    "#D4860A",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

const CATEGORIES: { key: string; label: string; variant: ListingCategory }[] = [
  { key: "ForSale",   label: "For Sale",      variant: { ForSale: null } },
  { key: "Services",  label: "Services",       variant: { Services: null } },
  { key: "Free",      label: "Free / Giveaway",variant: { Free: null } },
  { key: "LostFound", label: "Lost & Found",   variant: { LostFound: null } },
];

function categoryKey(cat: ListingCategory): string {
  if ("ForSale"   in cat) return "ForSale";
  if ("Services"  in cat) return "Services";
  if ("Free"      in cat) return "Free";
  return "LostFound";
}

function categoryLabel(cat: ListingCategory): string {
  return CATEGORIES.find((c) => c.key === categoryKey(cat))?.label ?? "";
}

function statusLabel(listing: Listing): string {
  if ("Sold"    in listing.status) return "SOLD";
  if ("Removed" in listing.status) return "REMOVED";
  return "ACTIVE";
}

function statusColor(listing: Listing): string {
  if ("Sold"    in listing.status) return S.green;
  if ("Removed" in listing.status) return S.rust;
  return S.navy;
}

function priceDisplay(listing: Listing): string {
  if (listing.priceCents.length === 0) return "Free";
  const cents = Number(listing.priceCents[0]);
  return `$${(cents / 100).toFixed(2)}`;
}

function errMsg(e: MarketplaceError): string {
  if ("InvalidInput"  in e) return e.InvalidInput;
  if ("NotFound"      in e) return "Not found.";
  if ("NotAuthorized" in e) return "Not authorized.";
  if ("TooManyPhotos" in e) return "Maximum 5 photos allowed.";
  return "Unknown error.";
}

type Tab = "browse" | "mine";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.5rem 0.75rem",
  border: `1px solid ${S.rule}`, fontFamily: S.sans,
  fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: S.mono, fontSize: "0.6rem",
  letterSpacing: "0.1em", textTransform: "uppercase",
  color: S.inkLight, marginBottom: "0.3rem",
};

export default function MarketplacePage() {
  const { principal } = useAuthStore();
  const [tab,       setTab]       = useState<Tab>("browse");
  const [listings,  setListings]  = useState<Listing[]>([]);
  const [mine,      setMine]      = useState<Listing[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filterCat, setFilterCat] = useState<string>("all");

  // Create / edit form
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<Listing | null>(null);
  const [formTitle,   setFormTitle]   = useState("");
  const [formDesc,    setFormDesc]    = useState("");
  const [formCat,     setFormCat]     = useState<ListingCategory>({ ForSale: null });
  const [formPrice,   setFormPrice]   = useState("");
  const [formContact, setFormContact] = useState("");
  const [formUnit,    setFormUnit]    = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);

  // Flag dialog
  const [flagTarget,  setFlagTarget]  = useState<string | null>(null);
  const [flagReason,  setFlagReason]  = useState("");
  const [flagging,    setFlagging]    = useState(false);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [all, my] = await Promise.all([
          getListings(),
          principal ? getMyListings(principal) : Promise.resolve([]),
        ]);
        setListings(all.sort((a, b) => Number(b.createdAt - a.createdAt)));
        setMine(my.sort((a, b) => Number(b.createdAt - a.createdAt)));
      } catch {
        // ignore — canister may not be deployed
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [principal]);

  const filtered = filterCat === "all"
    ? listings
    : listings.filter((l) => categoryKey(l.category) === filterCat);

  function openCreate() {
    setEditTarget(null);
    setFormTitle(""); setFormDesc(""); setFormCat({ ForSale: null });
    setFormPrice(""); setFormContact(""); setFormUnit("");
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(l: Listing) {
    setEditTarget(l);
    setFormTitle(l.title);
    setFormDesc(l.description);
    setFormCat(l.category);
    setFormPrice(l.priceCents.length > 0 ? String(Number(l.priceCents[0]) / 100) : "");
    setFormContact(l.contactInfo);
    setFormUnit(l.unitId);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const priceCents: [] | [number] = formPrice.trim()
      ? [Math.round(parseFloat(formPrice) * 100)]
      : [];
    const expiresAt = Date.now() * 1_000_000 + 30 * 24 * 3_600_000 * 1_000_000;
    try {
      if (editTarget) {
        const result = await editListing(
          editTarget.id, formTitle, formDesc, priceCents, [], formContact, expiresAt
        );
        if ("ok" in result) {
          setMine((prev) => prev.map((l) => l.id === editTarget.id ? result.ok : l));
          setListings((prev) => prev.map((l) => l.id === editTarget.id ? result.ok : l));
          setShowForm(false);
        } else {
          setFormError(errMsg(result.err));
        }
      } else {
        const result = await createListing(
          formTitle, formDesc, formCat, priceCents, [], formContact, formUnit, expiresAt
        );
        if ("ok" in result) {
          setListings((prev) => [result.ok, ...prev]);
          setMine((prev) => [result.ok, ...prev]);
          setShowForm(false);
        } else {
          setFormError(errMsg(result.err));
        }
      }
    } catch {
      setFormError("Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteListing(id).catch(() => null);
    setListings((prev) => prev.filter((l) => l.id !== id));
    setMine((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleMarkSold(id: string) {
    const result = await markSold(id).catch(() => null);
    if (result && "ok" in result) {
      setMine((prev) => prev.map((l) => l.id === id ? result.ok : l));
      setListings((prev) => prev.map((l) => l.id === id ? result.ok : l));
    }
  }

  async function handleRemove(id: string) {
    const result = await removeListing(id).catch(() => null);
    if (result && "ok" in result) {
      setListings((prev) => prev.map((l) => l.id === id ? result.ok : l));
      setMine((prev) => prev.map((l) => l.id === id ? result.ok : l));
    }
  }

  async function handleFlag() {
    if (!flagTarget || !flagReason.trim()) return;
    setFlagging(true);
    await flagListing(flagTarget, flagReason.trim()).catch(() => null);
    setFlagTarget(null);
    setFlagReason("");
    setFlagging(false);
  }

  function ListingCard({ listing }: { listing: Listing }) {
    const isOwn   = principal && listing.postedBy.toText() === principal;
    const isActive = "Active" in listing.status;
    const catLabel = categoryLabel(listing.category);

    return (
      <div style={{ border: `1px solid ${listing.isFlagged ? S.amber : S.rule}`, background: "#fff", marginBottom: "0.75rem" }}>
        <div style={{ padding: "1.25rem 1.5rem" }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: S.navy, textTransform: "uppercase", border: `1px solid ${S.navy}`, padding: "0.1rem 0.4rem" }}>{catLabel}</span>
              {!isActive && (
                <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: statusColor(listing), textTransform: "uppercase", border: `1px solid ${statusColor(listing)}`, padding: "0.1rem 0.4rem" }}>{statusLabel(listing)}</span>
              )}
              {listing.isFlagged && (
                <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: S.amber, textTransform: "uppercase", border: `1px solid ${S.amber}`, padding: "0.1rem 0.4rem" }}>FLAGGED</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              {isOwn && isActive && (
                <>
                  <button onClick={() => openEdit(listing)} style={{ background: "none", border: "none", color: S.navy, fontFamily: S.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>EDIT</button>
                  <button onClick={() => handleMarkSold(listing.id)} style={{ background: "none", border: "none", color: S.green, fontFamily: S.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>SOLD</button>
                  <button onClick={() => handleDelete(listing.id)} style={{ background: "none", border: "none", color: S.rust, fontFamily: S.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>DELETE</button>
                </>
              )}
              {!isOwn && isActive && (
                <button onClick={() => { setFlagTarget(listing.id); setFlagReason(""); }} style={{ background: "none", border: "none", color: S.inkLight, fontFamily: S.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>FLAG</button>
              )}
              {isActive && (
                <button onClick={() => handleRemove(listing.id)} style={{ background: "none", border: "none", color: S.rust, fontFamily: S.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>REMOVE</button>
              )}
            </div>
          </div>

          {/* Title + price */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
            <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "1rem" }}>{listing.title}</div>
            <div style={{ fontFamily: S.mono, fontSize: "0.85rem", fontWeight: 700, color: S.rust, flexShrink: 0, marginLeft: "1rem" }}>{priceDisplay(listing)}</div>
          </div>

          {/* Description */}
          <div style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "0.75rem" }}>{listing.description}</div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: S.mono, fontSize: "0.58rem", color: S.inkLight, letterSpacing: "0.06em" }}>
              Unit {listing.unitId} · {new Date(Number(listing.createdAt) / 1_000_000).toLocaleDateString()}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: "0.58rem", color: S.navy, letterSpacing: "0.06em" }}>
              {listing.contactInfo}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Marketplace</h1>
          <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem" }}>Community classifieds — for sale, services, free & found</p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: "0.5rem 1rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          Post Listing
        </button>
      </div>

      {/* Create / edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "-0.25rem" }}>{editTarget ? "Edit Listing" : "New Listing"}</div>
          <div><label style={labelStyle}>Title</label><input style={inputStyle} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required /></div>
          <div><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} required /></div>
          {!editTarget && (
            <div>
              <label style={labelStyle}>Category</label>
              <select style={{ ...inputStyle, background: "#fff" }} value={categoryKey(formCat)} onChange={(e) => { const c = CATEGORIES.find((x) => x.key === e.target.value); if (c) setFormCat(c.variant); }}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          )}
          <div><label style={labelStyle}>Price (leave blank for free)</label><input style={inputStyle} type="number" min="0" step="0.01" placeholder="0.00" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} /></div>
          <div><label style={labelStyle}>Contact Info</label><input style={inputStyle} placeholder="email, phone, or unit number" value={formContact} onChange={(e) => setFormContact(e.target.value)} required /></div>
          {!editTarget && (
            <div><label style={labelStyle}>Unit Number</label><input style={inputStyle} placeholder="e.g. 7C" value={formUnit} onChange={(e) => setFormUnit(e.target.value)} required /></div>
          )}
          {formError && <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, margin: 0 }}>{formError}</p>}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" disabled={submitting} style={{ flex: 1, padding: "0.75rem", background: S.navy, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
              {submitting ? "Saving…" : (editTarget ? "Update" : "Post")}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: "0.75rem 1rem", background: "none", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", color: S.inkLight }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Flag dialog */}
      {flagTarget && (
        <div style={{ border: `1px solid ${S.amber}`, padding: "1.25rem", background: "#fff", marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.amber, marginBottom: "0.75rem" }}>Report Listing</div>
          <input style={inputStyle} placeholder="Reason for flagging…" value={flagReason} onChange={(e) => setFlagReason(e.target.value)} />
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
            <button onClick={handleFlag} disabled={flagging || !flagReason.trim()} style={{ padding: "0.5rem 1rem", background: S.amber, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
              {flagging ? "Submitting…" : "Submit Report"}
            </button>
            <button onClick={() => { setFlagTarget(null); setFlagReason(""); }} style={{ padding: "0.5rem 1rem", background: "none", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", color: S.inkLight }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
        {(["browse", "mine"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "0.5rem 1.25rem", background: "none", border: "none", borderBottom: tab === t ? `2px solid ${S.navy}` : "2px solid transparent", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", color: tab === t ? S.navy : S.inkLight }}>
            {t === "browse" ? "Browse" : "My Listings"}
          </button>
        ))}
      </div>

      {/* Category filter (browse only) */}
      {tab === "browse" && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <button onClick={() => setFilterCat("all")} style={{ background: filterCat === "all" ? S.navy : "none", color: filterCat === "all" ? "#fff" : S.inkLight, border: `1px solid ${filterCat === "all" ? S.navy : S.rule}`, padding: "0.3rem 0.75rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setFilterCat(c.key)} style={{ background: filterCat === c.key ? S.navy : "none", color: filterCat === c.key ? "#fff" : S.inkLight, border: `1px solid ${filterCat === c.key ? S.navy : S.rule}`, padding: "0.3rem 0.75rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>{c.label}</button>
          ))}
        </div>
      )}

      {loading && <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading marketplace…</p>}

      {!loading && tab === "browse" && (
        <>
          {filtered.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO LISTINGS
            </div>
          )}
          {filtered.map((l) => <ListingCard key={l.id} listing={l} />)}
        </>
      )}

      {!loading && tab === "mine" && (
        <>
          {mine.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              YOU HAVE NO LISTINGS
            </div>
          )}
          {mine.map((l) => <ListingCard key={l.id} listing={l} />)}
        </>
      )}
    </div>
  );
}

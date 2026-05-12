import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import {
  createAmenity,
  updateAmenity,
  createReservation,
  cancelReservation,
  blockDate,
  unblockDate,
  joinWaitlist,
  leaveWaitlist,
  getAmenities,
  getReservationsForAmenity,
  getMyReservations,
  getAvailability,
  getBlockedDates,
  type Amenity,
  type Reservation,
  type SlotAvailability,
  type BlockedDate,
  type AmenitiesError,
} from "@/services/amenities";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F4F1EB",
  rule:     "#C8C3B8",
  rust:     "#C94C2E",
  inkLight: "#7A7268",
  green:    "#2E7D32",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

type Tab = "amenities" | "book" | "mine";

function errMsg(e: AmenitiesError): string {
  if ("InvalidInput"  in e) return e.InvalidInput;
  if ("NotFound"      in e) return "Not found.";
  if ("NotAuthorized" in e) return "Not authorized.";
  if ("CapacityExceeded" in e) return "Slot is at capacity.";
  if ("DateBlocked"   in e) return "This date is blocked by the board.";
  if ("AlreadyBooked" in e) return "You already have a reservation for this slot.";
  return "Unknown error.";
}

function slotLabel(slot: number, durationMins: number): string {
  const startMins = 6 * 60 + slot * durationMins;
  const h = Math.floor(startMins / 60);
  const m = startMins % 60;
  const endMins = startMins + durationMins;
  const eh = Math.floor(endMins / 60);
  const em = endMins % 60;
  const fmt = (hh: number, mm: number) =>
    `${hh % 12 === 0 ? 12 : hh % 12}:${mm.toString().padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  return `${fmt(h, m)} – ${fmt(eh, em)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Manage Panel (board-only) ────────────────────────────────────────────────

function ManagePanel({ amenities, reload }: { amenities: Amenity[]; reload: () => void }) {
  const [name,               setName]               = useState("");
  const [desc,               setDesc]               = useState("");
  const [capacity,           setCapacity]           = useState("10");
  const [slotMins,           setSlotMins]           = useState("60");
  const [advanceDays,        setAdvanceDays]        = useState("30");
  const [depositCents,       setDepositCents]       = useState("");
  const [cancellationHours,  setCancellationHours]  = useState("24");
  const [saving,             setSaving]             = useState(false);
  const [error,              setError]              = useState("");
  const [success,            setSuccess]            = useState("");

  // Block date
  const [blockAmenityId, setBlockAmenityId] = useState("");
  const [blockDateVal,   setBlockDateVal]   = useState(today());
  const [blockReason,    setBlockReason]    = useState("");
  const [blocking,       setBlocking]       = useState(false);
  const [blockError,     setBlockError]     = useState("");
  const [blockedDates,   setBlockedDates]   = useState<BlockedDate[]>([]);

  const loadBlocked = useCallback(async () => {
    if (!blockAmenityId) return;
    setBlockedDates(await getBlockedDates(blockAmenityId));
  }, [blockAmenityId]);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    setSaving(true);
    const deposit: [] | [number] = depositCents ? [parseInt(depositCents)] : [];
    const result = await createAmenity(
      name, desc,
      parseInt(capacity), parseInt(slotMins), parseInt(advanceDays),
      deposit, parseInt(cancellationHours)
    );
    setSaving(false);
    if ("err" in result) { setError(errMsg(result.err)); return; }
    setSuccess(`Created: ${result.ok.name}`);
    setName(""); setDesc(""); setCapacity("10"); setSlotMins("60");
    setAdvanceDays("30"); setDepositCents(""); setCancellationHours("24");
    reload();
  }

  async function handleToggleActive(a: Amenity) {
    await updateAmenity(
      a.id, a.name, a.description,
      Number(a.capacity), Number(a.slotDurationMins), Number(a.advanceBookingDays),
      a.depositAmountCents.length > 0 ? [Number(a.depositAmountCents[0])] : [],
      Number(a.cancellationHours),
      !a.isActive
    );
    reload();
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    setBlockError("");
    setBlocking(true);
    const result = await blockDate(blockAmenityId, blockDateVal, blockReason);
    setBlocking(false);
    if ("err" in result) { setBlockError(errMsg(result.err)); return; }
    setBlockReason(""); loadBlocked();
  }

  async function handleUnblock(id: string) {
    await unblockDate(id);
    loadBlocked();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontFamily: S.sans, fontSize: "0.9rem",
    border: `1px solid ${S.rule}`, background: S.paper, color: S.ink, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
    textTransform: "uppercase", color: S.inkLight, marginBottom: 4,
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
      {/* Create amenity */}
      <div>
        <h3 style={{ fontFamily: S.serif, fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>
          Add Amenity
        </h3>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={labelStyle}>Name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><label style={labelStyle}>Description</label>
            <input style={inputStyle} value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Capacity (guests/slot)</label>
              <input style={inputStyle} type="number" min={1} value={capacity} onChange={e => setCapacity(e.target.value)} required /></div>
            <div><label style={labelStyle}>Slot duration (mins)</label>
              <input style={inputStyle} type="number" min={15} step={15} value={slotMins} onChange={e => setSlotMins(e.target.value)} required /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Advance booking (days)</label>
              <input style={inputStyle} type="number" min={1} value={advanceDays} onChange={e => setAdvanceDays(e.target.value)} required /></div>
            <div><label style={labelStyle}>Cancellation cutoff (hours)</label>
              <input style={inputStyle} type="number" min={0} value={cancellationHours} onChange={e => setCancellationHours(e.target.value)} required /></div>
          </div>
          <div><label style={labelStyle}>Deposit (cents USD, optional)</label>
            <input style={inputStyle} type="number" min={0} value={depositCents} onChange={e => setDepositCents(e.target.value)} placeholder="0 = no deposit" /></div>
          {error   && <p style={{ color: S.rust,  fontFamily: S.sans, fontSize: "0.85rem" }}>{error}</p>}
          {success && <p style={{ color: S.green, fontFamily: S.sans, fontSize: "0.85rem" }}>{success}</p>}
          <button type="submit" disabled={saving} style={{
            padding: "10px 20px", background: S.rust, color: "#fff", border: "none",
            fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Saving…" : "Create Amenity"}
          </button>
        </form>

        {/* Existing amenities */}
        {amenities.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h4 style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, marginBottom: 10 }}>
              Existing Amenities
            </h4>
            {amenities.map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${S.rule}` }}>
                <div>
                  <span style={{ fontFamily: S.sans, fontSize: "0.9rem", fontWeight: 500 }}>{a.name}</span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight, marginLeft: 8 }}>
                    cap {String(a.capacity)} · {String(a.slotDurationMins)}min slots
                  </span>
                </div>
                <button onClick={() => handleToggleActive(a)} style={{
                  padding: "4px 10px", border: `1px solid ${S.rule}`, background: "none",
                  fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em",
                  textTransform: "uppercase", cursor: "pointer",
                  color: a.isActive ? S.inkLight : S.rust,
                }}>
                  {a.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Block dates */}
      <div>
        <h3 style={{ fontFamily: S.serif, fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>
          Block Dates
        </h3>
        <form onSubmit={handleBlock} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={labelStyle}>Amenity</label>
            <select style={inputStyle} value={blockAmenityId} onChange={e => setBlockAmenityId(e.target.value)} required>
              <option value="">— select —</option>
              {amenities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Date</label>
            <input style={inputStyle} type="date" value={blockDateVal} onChange={e => setBlockDateVal(e.target.value)} required /></div>
          <div><label style={labelStyle}>Reason</label>
            <input style={inputStyle} value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Maintenance, private event…" /></div>
          {blockError && <p style={{ color: S.rust, fontFamily: S.sans, fontSize: "0.85rem" }}>{blockError}</p>}
          <button type="submit" disabled={blocking || !blockAmenityId} style={{
            padding: "10px 20px", background: S.ink, color: "#fff", border: "none",
            fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: (blocking || !blockAmenityId) ? "not-allowed" : "pointer",
            opacity: (blocking || !blockAmenityId) ? 0.5 : 1,
          }}>
            {blocking ? "Blocking…" : "Block Date"}
          </button>
        </form>

        {blockedDates.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, marginBottom: 8 }}>
              Blocked Dates
            </h4>
            {blockedDates.map(b => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${S.rule}` }}>
                <div>
                  <span style={{ fontFamily: S.sans, fontSize: "0.85rem" }}>{b.date}</span>
                  {b.reason && <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight, marginLeft: 8 }}>{b.reason}</span>}
                </div>
                <button onClick={() => handleUnblock(b.id)} style={{
                  padding: "3px 8px", border: `1px solid ${S.rule}`, background: "none",
                  fontFamily: S.mono, fontSize: "0.65rem", cursor: "pointer", color: S.inkLight,
                }}>
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Book Panel ───────────────────────────────────────────────────────────────

function BookPanel({ amenities }: { amenities: Amenity[] }) {
  const { principal } = useAuthStore();
  const [amenityId,   setAmenityId]   = useState("");
  const [date,        setDate]        = useState(today());
  const [unitId,      setUnitId]      = useState("");
  const [slots,       setSlots]       = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking,     setBooking]     = useState<number | null>(null);
  const [guestCount,  setGuestCount]  = useState(1);
  const [bookError,   setBookError]   = useState("");
  const [bookSuccess, setBookSuccess] = useState("");
  const [joining,     setJoining]     = useState<number | null>(null);

  const selectedAmenity = amenities.find(a => a.id === amenityId);

  const loadSlots = useCallback(async () => {
    if (!amenityId || !date) return;
    setLoadingSlots(true);
    setSlots(await getAvailability(amenityId, date));
    setLoadingSlots(false);
  }, [amenityId, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  async function handleBook(slot: number) {
    setBookError(""); setBookSuccess(""); setBooking(slot);
    const result = await createReservation(amenityId, date, slot, guestCount, unitId);
    setBooking(null);
    if ("err" in result) { setBookError(errMsg(result.err)); return; }
    setBookSuccess(`Booked ${slotLabel(slot, selectedAmenity ? Number(selectedAmenity.slotDurationMins) : 60)}`);
    loadSlots();
  }

  async function handleJoinWaitlist(slot: number) {
    setBookError(""); setJoining(slot);
    if (!principal) { setJoining(null); return; }
    const result = await joinWaitlist(amenityId, date, slot, unitId);
    setJoining(null);
    if ("err" in result) { setBookError(errMsg(result.err)); return; }
    setBookSuccess(`Added to waitlist for ${slotLabel(slot, selectedAmenity ? Number(selectedAmenity.slotDurationMins) : 60)}`);
  }

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", fontFamily: S.sans, fontSize: "0.9rem",
    border: `1px solid ${S.rule}`, background: S.paper, color: S.ink, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
    textTransform: "uppercase", color: S.inkLight, marginBottom: 4,
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 100px", gap: 16, marginBottom: 24 }}>
        <div><label style={labelStyle}>Amenity</label>
          <select style={{ ...inputStyle, width: "100%" }} value={amenityId} onChange={e => setAmenityId(e.target.value)}>
            <option value="">— select —</option>
            {amenities.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>Date</label>
          <input style={{ ...inputStyle, width: "100%" }} type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label style={labelStyle}>Unit ID</label>
          <input style={{ ...inputStyle, width: "100%" }} value={unitId} onChange={e => setUnitId(e.target.value)} placeholder="42B" /></div>
        <div><label style={labelStyle}>Guests</label>
          <input style={{ ...inputStyle, width: "100%" }} type="number" min={1} value={guestCount} onChange={e => setGuestCount(parseInt(e.target.value) || 1)} /></div>
      </div>

      {bookError   && <p style={{ color: S.rust,  fontFamily: S.sans, fontSize: "0.85rem", marginBottom: 12 }}>{bookError}</p>}
      {bookSuccess && <p style={{ color: S.green, fontFamily: S.sans, fontSize: "0.85rem", marginBottom: 12 }}>{bookSuccess}</p>}

      {/* Deposit notice */}
      {selectedAmenity && selectedAmenity.depositAmountCents.length > 0 && (
        <div style={{ padding: "10px 14px", border: `1px solid ${S.rule}`, background: "#FFFBF0", marginBottom: 16, fontFamily: S.sans, fontSize: "0.85rem", color: S.inkLight }}>
          This amenity requires a <strong>${(Number(selectedAmenity.depositAmountCents[0]) / 100).toFixed(2)} refundable deposit</strong>.
          Deposit collection is processed separately by the board (see issue #43).
        </div>
      )}

      {/* Availability grid */}
      {!amenityId && (
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>Select an amenity to see availability.</p>
      )}
      {amenityId && loadingSlots && (
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>Loading slots…</p>
      )}
      {amenityId && !loadingSlots && slots.length === 0 && (
        <p style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>No slots available for this amenity/date.</p>
      )}
      {amenityId && !loadingSlots && slots.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {slots.map(s => {
            const slotNum = Number(s.slot);
            const dur = selectedAmenity ? Number(selectedAmenity.slotDurationMins) : 60;
            const spotsLeft = Number(s.capacity) - Number(s.booked);
            const isBooked = booking === slotNum;
            const isJoining = joining === slotNum;
            const bgColor = s.blocked ? "#F0F0EE" : s.available ? "#F4FBF4" : "#FFF8F7";
            const borderColor = s.blocked ? S.rule : s.available ? "#C8DFC8" : "#F0C0B8";
            return (
              <div key={slotNum} style={{ padding: "12px 14px", border: `1px solid ${borderColor}`, background: bgColor }}>
                <div style={{ fontFamily: S.mono, fontSize: "0.75rem", color: S.inkLight, marginBottom: 4 }}>
                  {slotLabel(slotNum, dur)}
                </div>
                {s.blocked ? (
                  <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight }}>Blocked</div>
                ) : (
                  <>
                    <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: s.available ? S.green : S.rust, marginBottom: 8 }}>
                      {s.available ? `${spotsLeft} of ${String(s.capacity)} spots open` : "Full"}
                    </div>
                    {s.available ? (
                      <button onClick={() => handleBook(slotNum)} disabled={isBooked || !unitId} style={{
                        padding: "5px 12px", background: S.rust, color: "#fff", border: "none",
                        fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em",
                        textTransform: "uppercase", cursor: (isBooked || !unitId) ? "not-allowed" : "pointer",
                        opacity: (isBooked || !unitId) ? 0.6 : 1,
                      }}>
                        {isBooked ? "Booking…" : "Book"}
                      </button>
                    ) : (
                      <button onClick={() => handleJoinWaitlist(slotNum)} disabled={isJoining || !unitId} style={{
                        padding: "5px 12px", background: "none", color: S.inkLight,
                        border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.65rem",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                        cursor: (isJoining || !unitId) ? "not-allowed" : "pointer",
                        opacity: (isJoining || !unitId) ? 0.5 : 1,
                      }}>
                        {isJoining ? "Joining…" : "Waitlist"}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── My Reservations Panel ────────────────────────────────────────────────────

function MyReservationsPanel({ amenities }: { amenities: Amenity[] }) {
  const { principal } = useAuthStore();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [cancelling,   setCancelling]   = useState<string | null>(null);
  const [error,        setError]        = useState("");

  const load = useCallback(async () => {
    if (!principal) return;
    setLoading(true);
    setReservations(await getMyReservations(principal));
    setLoading(false);
  }, [principal]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(id: string) {
    setError(""); setCancelling(id);
    const result = await cancelReservation(id);
    setCancelling(null);
    if ("err" in result) { setError(errMsg(result.err)); return; }
    load();
  }

  function amenityName(id: string) {
    return amenities.find(a => a.id === id)?.name ?? id;
  }

  function statusColor(s: Reservation["status"]) {
    if ("Active"    in s) return S.green;
    if ("Cancelled" in s) return S.inkLight;
    return S.rust;
  }

  function statusLabel(s: Reservation["status"]) {
    if ("Active"    in s) return "Active";
    if ("Cancelled" in s) return "Cancelled";
    return "Completed";
  }

  if (loading) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading…</p>;
  if (reservations.length === 0) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>No reservations yet.</p>;

  return (
    <div>
      {error && <p style={{ color: S.rust, fontFamily: S.sans, fontSize: "0.85rem", marginBottom: 12 }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.sans, fontSize: "0.88rem" }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${S.rule}` }}>
            {["Amenity", "Date", "Slot", "Guests", "Unit", "Status", ""].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reservations.map(r => {
            const dur = amenities.find(a => a.id === r.amenityId)?.slotDurationMins;
            return (
              <tr key={r.id} style={{ borderBottom: `1px solid ${S.rule}` }}>
                <td style={{ padding: "8px 10px" }}>{amenityName(r.amenityId)}</td>
                <td style={{ padding: "8px 10px" }}>{r.date}</td>
                <td style={{ padding: "8px 10px", fontFamily: S.mono, fontSize: "0.75rem" }}>
                  {dur ? slotLabel(Number(r.startSlot), Number(dur)) : `Slot ${String(r.startSlot)}`}
                </td>
                <td style={{ padding: "8px 10px" }}>{String(r.guestCount)}</td>
                <td style={{ padding: "8px 10px" }}>{r.unitId}</td>
                <td style={{ padding: "8px 10px", color: statusColor(r.status), fontFamily: S.mono, fontSize: "0.75rem" }}>
                  {statusLabel(r.status)}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {"Active" in r.status && (
                    <button onClick={() => handleCancel(r.id)} disabled={cancelling === r.id} style={{
                      padding: "3px 8px", border: `1px solid ${S.rule}`, background: "none",
                      fontFamily: S.mono, fontSize: "0.65rem", cursor: cancelling === r.id ? "not-allowed" : "pointer",
                      color: S.inkLight, opacity: cancelling === r.id ? 0.5 : 1,
                    }}>
                      {cancelling === r.id ? "…" : "Cancel"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AmenitiesPage() {
  const [tab,       setTab]       = useState<Tab>("book");
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading,   setLoading]   = useState(true);

  const loadAmenities = useCallback(async () => {
    setLoading(true);
    setAmenities(await getAmenities());
    setLoading(false);
  }, []);

  useEffect(() => { loadAmenities(); }, [loadAmenities]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "book",      label: "Book" },
    { key: "mine",      label: "My Reservations" },
    { key: "amenities", label: "Manage (Board)" },
  ];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto", fontFamily: S.sans, color: S.ink }}>
      {/* Header */}
      <div style={{ borderBottom: `2px solid ${S.ink}`, paddingBottom: 16, marginBottom: 28 }}>
        <h1 style={{ fontFamily: S.serif, fontSize: "2rem", fontWeight: 900, margin: 0 }}>Amenities</h1>
        <p style={{ color: S.inkLight, marginTop: 6, fontSize: "0.9rem" }}>
          Book the pool, clubhouse, courts, gym, and more.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rule}`, marginBottom: 28 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontFamily: S.mono, fontSize: "0.72rem", letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: tab === t.key ? S.rust : S.inkLight,
            borderBottom: tab === t.key ? `2px solid ${S.rust}` : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: S.inkLight }}>Loading amenities…</p>
      ) : (
        <>
          {tab === "amenities" && <ManagePanel amenities={amenities} reload={loadAmenities} />}
          {tab === "book"      && <BookPanel amenities={amenities} />}
          {tab === "mine"      && <MyReservationsPanel amenities={amenities} />}
        </>
      )}
    </div>
  );
}

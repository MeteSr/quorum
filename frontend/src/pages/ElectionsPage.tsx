import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { Principal } from "@dfinity/principal";
import {
  getAllElections,
  getActiveElections,
  createElection,
  nominateSelf,
  castBallot,
  certifyResults,
  cancelElection,
  getNominations,
  getElectionResult,
  type Election,
  type Nomination,
  type ElectionResult,
  type ElectionType,
  type BallotChoice,
  type GovernanceError,
} from "@/services/governance";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F4F1EB",
  rule:     "#C8C3B8",
  rust:     "#C94C2E",
  inkLight: "#7A7268",
  serif:    "'Playfair Display', Georgia, serif",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', sans-serif",
};

type Tab = "active" | "all" | "create";

const ELECTION_TYPE_LABELS: Record<string, string> = {
  BoardSeat:         "Board Seat",
  ByLawAmendment:    "Bylaw Amendment",
  SpecialAssessment: "Special Assessment",
};

function errText(e: GovernanceError): string {
  if ("InvalidInput" in e) return e.InvalidInput;
  if ("NotFound"     in e) return "Election not found";
  if ("NotAuthorized"in e) return "Not authorized";
  if ("AlreadyVoted" in e) return "You have already voted";
  if ("AlreadyNominated" in e) return "Already nominated";
  if ("ElectionNotOver"  in e) return "Voting window is still open";
  return "Unknown error";
}

function phaseLabel(e: Election): string {
  const now = BigInt(Date.now()) * 1_000_000n;
  if ("Certified" in e.status) return "Certified";
  if ("Cancelled" in e.status) return "Cancelled";
  if (now < e.nominationDeadline) return "Nominations Open";
  if (now < e.votingOpen)         return "Pending Voting";
  if (now <= e.votingClose)       return "Voting Open";
  return "Awaiting Certification";
}

function phaseBadgeColor(label: string): string {
  if (label === "Nominations Open") return "#2563eb";
  if (label === "Voting Open")      return "#16a34a";
  if (label === "Certified")        return S.rust;
  if (label === "Cancelled")        return S.inkLight;
  return S.inkLight;
}

// ─── Election Detail Modal ────────────────────────────────────────────────────

function ElectionModal({
  election,
  principal,
  onClose,
  onRefresh,
}: {
  election: Election;
  principal: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [result, setResult]           = useState<ElectionResult | null>(null);
  const [nomBio, setNomBio]           = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [yeaNay, setYeaNay]           = useState<boolean | null>(null);
  const [loading, setLoading]         = useState(false);
  const [msg, setMsg]                 = useState("");

  const phase = phaseLabel(election);
  const isBoardSeat = "BoardSeat" in election.electionType;
  const seats = election.seats.length > 0 ? Number(election.seats[0]) : null;

  useEffect(() => {
    getNominations(election.id).then(setNominations);
    getElectionResult(election.id).then(setResult);
  }, [election.id]);

  async function handleNominateSelf() {
    if (!nomBio.trim()) { setMsg("Bio is required"); return; }
    setLoading(true); setMsg("");
    const r = await nominateSelf(election.id, nomBio.trim(), []);
    if ("ok" in r) {
      setMsg("Nominated successfully.");
      getNominations(election.id).then(setNominations);
      setNomBio("");
    } else { setMsg(errText(r.err)); }
    setLoading(false);
  }

  async function handleCastBallot() {
    setLoading(true); setMsg("");
    let choice: BallotChoice;
    if (isBoardSeat) {
      choice = { Candidates: selectedCandidates.map(p => Principal.fromText(p)) };
    } else {
      if (yeaNay === null) { setMsg("Select Yea or Nay."); setLoading(false); return; }
      choice = { YeaNay: yeaNay };
    }
    const r = await castBallot(election.id, choice);
    if ("ok" in r) { setMsg("Ballot cast successfully."); onRefresh(); }
    else { setMsg(errText(r.err)); }
    setLoading(false);
  }

  async function handleCertify() {
    setLoading(true); setMsg("");
    const r = await certifyResults(election.id);
    if ("ok" in r) { setResult(r.ok); onRefresh(); }
    else { setMsg(errText(r.err)); }
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("Cancel this election?")) return;
    setLoading(true); setMsg("");
    const r = await cancelElection(election.id);
    if ("ok" in r) { onClose(); onRefresh(); }
    else { setMsg(errText(r.err)); }
    setLoading(false);
  }

  function toggleCandidate(p: string) {
    setSelectedCandidates(prev =>
      prev.includes(p)
        ? prev.filter(x => x !== p)
        : [...prev, p]
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: S.paper, border: `1px solid ${S.rule}`,
        padding: "2rem", maxWidth: 560, width: "90%", maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: S.rust, marginBottom: 4 }}>
              {ELECTION_TYPE_LABELS[Object.keys(election.electionType)[0]] ?? ""} · <span style={{ color: phaseBadgeColor(phase) }}>{phase}</span>
            </div>
            <h2 style={{ fontFamily: S.serif, fontSize: "1.25rem", margin: 0 }}>{election.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.25rem", color: S.inkLight }}>×</button>
        </div>

        {/* Nomination phase */}
        {phase === "Nominations Open" && (
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.75rem" }}>Nominate Yourself</div>
            <textarea
              placeholder="Candidate bio (why you're running, experience…)"
              value={nomBio}
              onChange={e => setNomBio(e.target.value)}
              rows={3}
              style={{ width: "100%", fontFamily: S.sans, fontSize: "0.85rem", border: `1px solid ${S.rule}`, padding: "0.5rem", background: "white", resize: "vertical", boxSizing: "border-box" }}
            />
            <button
              onClick={handleNominateSelf}
              disabled={loading}
              style={{ marginTop: "0.5rem", background: S.rust, color: "white", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1rem", cursor: "pointer" }}
            >
              {loading ? "Submitting…" : "Nominate Self"}
            </button>
          </section>
        )}

        {/* Nominations list */}
        {nominations.length > 0 && (
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.5rem" }}>
              Candidates ({nominations.length})
            </div>
            {nominations.map(n => (
              <div key={n.id} style={{ borderBottom: `1px solid ${S.rule}`, padding: "0.5rem 0", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                {isBoardSeat && phase === "Voting Open" && (
                  <input
                    type="checkbox"
                    checked={selectedCandidates.includes(n.candidate.toText())}
                    onChange={() => toggleCandidate(n.candidate.toText())}
                    disabled={seats !== null && !selectedCandidates.includes(n.candidate.toText()) && selectedCandidates.length >= seats}
                    style={{ marginTop: 4 }}
                  />
                )}
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.rust }}>{n.candidate.toText().slice(0, 12)}…</div>
                  <div style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.ink, marginTop: 2 }}>{n.bio}</div>
                </div>
              </div>
            ))}
            {isBoardSeat && seats && <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.25rem" }}>Select up to {seats} candidate{seats > 1 ? "s" : ""}</div>}
          </section>
        )}

        {/* Voting phase — yea/nay for non-board-seat */}
        {phase === "Voting Open" && !isBoardSeat && (
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.5rem" }}>Cast Your Vote</div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {(["Yea", "Nay"] as const).map(label => (
                <button
                  key={label}
                  onClick={() => setYeaNay(label === "Yea")}
                  style={{
                    padding: "0.4rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem",
                    letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                    border: `1px solid ${S.rule}`,
                    background: (yeaNay === (label === "Yea")) ? S.rust : "white",
                    color: (yeaNay === (label === "Yea")) ? "white" : S.ink,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Submit ballot button */}
        {phase === "Voting Open" && (
          <button
            onClick={handleCastBallot}
            disabled={loading}
            style={{ background: S.ink, color: "white", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", cursor: "pointer", marginBottom: "1rem" }}
          >
            {loading ? "Submitting…" : "Submit Ballot"}
          </button>
        )}

        {/* Certify button — shown after voting closed */}
        {phase === "Awaiting Certification" && (
          <button
            onClick={handleCertify}
            disabled={loading}
            style={{ background: S.rust, color: "white", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", cursor: "pointer", marginBottom: "1rem" }}
          >
            {loading ? "Certifying…" : "Certify Results"}
          </button>
        )}

        {/* Certified results */}
        {result && (
          <section style={{ marginTop: "1rem", borderTop: `1px solid ${S.rule}`, paddingTop: "1rem" }}>
            <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.5rem" }}>
              Certified Results — {result.passed ? "✓ Passed" : "✗ Failed"} · Quorum {result.quorumReached ? "Reached" : "Not Reached"}
            </div>
            <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight, marginBottom: "0.5rem" }}>
              {Number(result.totalBallots)} ballot{result.totalBallots !== 1n ? "s" : ""} cast
              {!isBoardSeat && ` · Yea: ${result.yeaVotes} · Nay: ${result.nayVotes}`}
            </div>
            {result.tallies.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${S.rule}`, padding: "0.3rem 0", fontFamily: S.sans, fontSize: "0.85rem" }}>
                <span>{t.candidate.toText().slice(0, 16)}…</span>
                <span style={{ fontFamily: S.mono, color: S.rust }}>{t.votes.toString()} vote{t.votes !== 1n ? "s" : ""}</span>
              </div>
            ))}
          </section>
        )}

        {/* Cancel button */}
        {("Active" in election.status) && election.createdBy.toText() === principal && phase !== "Voting Open" && (
          <div style={{ marginTop: "1rem" }}>
            <button
              onClick={handleCancel}
              disabled={loading}
              style={{ background: "none", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.3rem 0.75rem", cursor: "pointer", color: S.inkLight }}
            >
              Cancel Election
            </button>
          </div>
        )}

        {msg && <div style={{ marginTop: "0.75rem", fontFamily: S.sans, fontSize: "0.8rem", color: S.rust }}>{msg}</div>}
      </div>
    </div>
  );
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [title,              setTitle]              = useState("");
  const [electionType,       setElectionType]       = useState<ElectionType>({ BoardSeat: null });
  const [nomDays,            setNomDays]            = useState("7");
  const [voteDays,           setVoteDays]           = useState("7");
  const [totalUnits,         setTotalUnits]         = useState("100");
  const [quorumPct,          setQuorumPct]          = useState("10");
  const [seats,              setSeats]              = useState("3");
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState("");

  const isBoardSeat = "BoardSeat" in electionType;
  const MS = 1_000_000n;

  async function handleCreate() {
    if (!title.trim()) { setError("Title required"); return; }
    setLoading(true); setError("");
    const now = BigInt(Date.now()) * MS;
    const nomDeadline = now + BigInt(parseInt(nomDays) || 7) * 86_400_000n * MS;
    const vOpen  = nomDeadline + 3_600_000n * MS;   // 1h after nom deadline
    const vClose = vOpen + BigInt(parseInt(voteDays) || 7) * 86_400_000n * MS;
    const seatOpt: [] | [bigint] = isBoardSeat ? [BigInt(parseInt(seats) || 3)] : [];
    const r = await createElection(
      title.trim(), electionType,
      nomDeadline, vOpen, vClose,
      BigInt(parseInt(quorumPct) || 10),
      BigInt(parseInt(totalUnits) || 100),
      seatOpt
    );
    if ("ok" in r) { onCreated(); setTitle(""); }
    else { setError(errText(r.err)); }
    setLoading(false);
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: S.sans, fontSize: "0.85rem",
    border: `1px solid ${S.rule}`, padding: "0.4rem 0.6rem",
    background: "white", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase",
    letterSpacing: "0.1em", color: S.inkLight, marginBottom: "0.25rem", display: "block",
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontFamily: S.serif, fontSize: "1.25rem", marginBottom: "1.5rem" }}>Create Election</h2>
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} placeholder="Board Election 2026" />
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Election Type</label>
        <select
          value={Object.keys(electionType)[0]}
          onChange={e => {
            const v = e.target.value;
            setElectionType(v === "BoardSeat" ? { BoardSeat: null } : v === "ByLawAmendment" ? { ByLawAmendment: null } : { SpecialAssessment: null });
          }}
          style={fieldStyle}
        >
          <option value="BoardSeat">Board Seat</option>
          <option value="ByLawAmendment">Bylaw Amendment</option>
          <option value="SpecialAssessment">Special Assessment</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label style={labelStyle}>Nomination Window (days)</label>
          <input type="number" min="1" value={nomDays} onChange={e => setNomDays(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Voting Window (days)</label>
          <input type="number" min="1" value={voteDays} onChange={e => setVoteDays(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Total Eligible Units</label>
          <input type="number" min="1" value={totalUnits} onChange={e => setTotalUnits(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Quorum % (FL §720.306 = 10)</label>
          <input type="number" min="1" max="100" value={quorumPct} onChange={e => setQuorumPct(e.target.value)} style={fieldStyle} />
        </div>
        {isBoardSeat && (
          <div>
            <label style={labelStyle}>Seats to Fill</label>
            <input type="number" min="1" value={seats} onChange={e => setSeats(e.target.value)} style={fieldStyle} />
          </div>
        )}
      </div>
      {error && <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, marginBottom: "0.75rem" }}>{error}</div>}
      <button
        onClick={handleCreate}
        disabled={loading}
        style={{ background: S.ink, color: "white", border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.5rem 1.25rem", cursor: "pointer" }}
      >
        {loading ? "Creating…" : "Create Election"}
      </button>
    </div>
  );
}

// ─── Election Card ────────────────────────────────────────────────────────────

function ElectionCard({ election, onClick }: { election: Election; onClick: () => void }) {
  const phase = phaseLabel(election);
  return (
    <div
      onClick={onClick}
      style={{ border: `1px solid ${S.rule}`, padding: "1rem 1.25rem", cursor: "pointer", marginBottom: "0.75rem", background: "white" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: phaseBadgeColor(phase), marginBottom: 4 }}>
            {ELECTION_TYPE_LABELS[Object.keys(election.electionType)[0]] ?? ""} · {phase}
          </div>
          <div style={{ fontFamily: S.serif, fontSize: "1rem" }}>{election.title}</div>
        </div>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, textAlign: "right" }}>
          <div>Quorum {election.quorumPercent.toString()}%</div>
          {election.seats.length > 0 && <div>{election.seats[0]?.toString()} seat{Number(election.seats[0]) > 1 ? "s" : ""}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ElectionsPage() {
  const { principal } = useAuthStore();
  const [tab,      setTab]      = useState<Tab>("active");
  const [elections, setElections] = useState<Election[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Election | null>(null);

  async function load() {
    setLoading(true);
    const data = tab === "active" ? await getActiveElections() : await getAllElections();
    setElections(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tab]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: S.serif, fontSize: "1.5rem", margin: 0 }}>Elections</h1>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>On-chain · Secret Ballot</div>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.5rem" }}>
        {(["active", "all", "create"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
              textTransform: "uppercase", paddingBottom: "0.5rem",
              color: tab === t ? S.ink : S.inkLight,
              borderBottom: tab === t ? `2px solid ${S.ink}` : "2px solid transparent",
            }}
          >
            {t === "active" ? "Active" : t === "all" ? "All Elections" : "Create"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <CreateForm onCreated={() => { setTab("active"); load(); }} />
      ) : loading ? (
        <div style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>Loading…</div>
      ) : elections.length === 0 ? (
        <div style={{ fontFamily: S.sans, fontSize: "0.9rem", color: S.inkLight }}>
          {tab === "active" ? "No active elections at this time." : "No elections yet."}
        </div>
      ) : (
        elections.map(e => (
          <ElectionCard key={e.id} election={e} onClick={() => setSelected(e)} />
        ))
      )}

      {selected && (
        <ElectionModal
          election={selected}
          principal={principal}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

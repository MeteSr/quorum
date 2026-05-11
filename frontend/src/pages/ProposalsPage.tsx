import { useEffect, useState } from "react";
import {
  getAllProposals,
  castVote,
  getAllPolls,
  createPoll,
  castPollVote,
  closePoll,
  type Proposal,
  type VoteChoice,
  type Poll,
} from "@/services/governance";

const styles = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  sage:     "#5A8C58",
  rust:     "#C94C2E",
  amber:    "#D4860A",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

// ─── Proposal helpers ────────────────────────────────────────────────────────

function proposalStatusColor(status: Proposal["status"]): string {
  if ("Open"   in status) return styles.sage;
  if ("Passed" in status) return styles.navy;
  if ("Failed" in status) return styles.rust;
  return styles.inkLight;
}

function proposalStatusLabel(status: Proposal["status"]): string {
  return Object.keys(status)[0].toUpperCase();
}

function voteBar(proposal: Proposal) {
  const total = Number(proposal.yesVotes + proposal.noVotes + proposal.abstainVotes) || 1;
  const yesPct = (Number(proposal.yesVotes) / total) * 100;
  const noPct  = (Number(proposal.noVotes)  / total) * 100;
  return (
    <div style={{ display: "flex", height: 6, marginTop: "0.75rem", gap: 2 }}>
      <div style={{ width: `${yesPct}%`, background: styles.sage }} />
      <div style={{ width: `${noPct}%`,  background: styles.rust }} />
      <div style={{ flex: 1, background: styles.rule }} />
    </div>
  );
}

// ─── Poll helpers ─────────────────────────────────────────────────────────────

function pollIsOpen(poll: Poll): boolean {
  return "Open" in poll.status && Date.now() * 1_000_000 < Number(poll.deadline);
}

function pollOptionBar(votes: bigint, totalVotes: number) {
  const pct = totalVotes > 0 ? (Number(votes) / totalVotes) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: 8, background: "#f0ede8", position: "relative" as const }}>
        <div style={{ position: "absolute" as const, left: 0, top: 0, height: "100%", width: `${pct}%`, background: styles.navy }} />
      </div>
      <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, minWidth: "2.5rem", textAlign: "right" as const }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [tab,       setTab]       = useState<"proposals" | "polls">("proposals");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [polls,     setPolls]     = useState<Poll[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [voting,    setVoting]    = useState<string | null>(null);

  // Poll creation form
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions,  setPollOptions]  = useState(["", ""]);
  const [pollDays,     setPollDays]     = useState<"1" | "2" | "7">("2");
  const [pollLive,     setPollLive]     = useState(true);
  const [pollAnon,     setPollAnon]     = useState(false);
  const [pollCreating, setPollCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      getAllProposals().catch(() => [] as Proposal[]),
      getAllPolls().catch(() => [] as Poll[]),
    ]).then(([props, pols]) => {
      setProposals(props);
      setPolls(pols);
    }).finally(() => setLoading(false));
  }, []);

  async function vote(proposalId: string, choice: VoteChoice) {
    setVoting(proposalId);
    try {
      const result = await castVote(proposalId, choice);
      if ("ok" in result) setProposals(await getAllProposals());
    } finally {
      setVoting(null);
    }
  }

  async function votePoll(pollId: string, optionIdx: number) {
    setVoting(pollId);
    try {
      const result = await castPollVote(pollId, BigInt(optionIdx));
      if ("ok" in result) setPolls(await getAllPolls());
    } finally {
      setVoting(null);
    }
  }

  async function handleClosePoll(pollId: string) {
    const result = await closePoll(pollId);
    if ("ok" in result) setPolls(await getAllPolls());
  }

  async function handleCreatePoll(evt: React.FormEvent) {
    evt.preventDefault();
    const filledOptions = pollOptions.filter((opt) => opt.trim().length > 0);
    if (filledOptions.length < 2) return;
    setPollCreating(true);
    try {
      const daysMs  = parseInt(pollDays) * 86_400_000;
      const deadlineNs = BigInt(Date.now() + daysMs) * BigInt(1_000_000);
      const result = await createPoll(pollQuestion, filledOptions, deadlineNs, pollLive, pollAnon);
      if ("ok" in result) {
        setPolls(await getAllPolls());
        setShowPollForm(false);
        setPollQuestion(""); setPollOptions(["", ""]); setPollDays("2");
      }
    } finally {
      setPollCreating(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "0.5rem 0.75rem", border: `1px solid ${styles.rule}`,
    fontFamily: styles.sans, fontSize: "0.875rem", outline: "none",
    boxSizing: "border-box" as const,
  };

  const tabStyle = (active: boolean) => ({
    padding: "0.4rem 1rem", background: "none",
    border: "none", borderBottom: active ? `2px solid ${styles.navy}` : "2px solid transparent",
    fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em",
    textTransform: "uppercase" as const, cursor: "pointer",
    color: active ? styles.navy : styles.inkLight,
  });

  if (loading) return <p style={{ fontFamily: styles.sans, color: styles.inkLight }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontFamily: styles.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Proposals & Polls</h1>
          <p style={{ color: styles.inkLight, fontFamily: styles.sans, fontSize: "0.9rem" }}>
            Formal votes and community pulse checks
          </p>
        </div>
        {tab === "polls" && (
          <button
            onClick={() => setShowPollForm(!showPollForm)}
            style={{ padding: "0.5rem 1rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
          >
            {showPollForm ? "Cancel" : "New Poll"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${styles.rule}`, marginBottom: "1.5rem" }}>
        <button style={tabStyle(tab === "proposals")} onClick={() => setTab("proposals")}>Proposals</button>
        <button style={tabStyle(tab === "polls")} onClick={() => setTab("polls")}>
          Quick Polls {polls.filter(pollIsOpen).length > 0 && `(${polls.filter(pollIsOpen).length} open)`}
        </button>
      </div>

      {/* ── Proposals tab ─────────────────────────────────────────────────── */}
      {tab === "proposals" && (
        <>
          {proposals.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO PROPOSALS YET
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {proposals.map((proposal) => {
              const isOpen = "Open" in proposal.status;
              return (
                <div key={proposal.id} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: proposalStatusColor(proposal.status), textTransform: "uppercase", marginBottom: "0.4rem" }}>
                        {proposalStatusLabel(proposal.status)}
                      </div>
                      <h3 style={{ fontFamily: styles.serif, fontWeight: 700, fontSize: "1.1rem", margin: "0 0 0.5rem" }}>{proposal.title}</h3>
                      <p style={{ fontFamily: styles.sans, fontSize: "0.875rem", color: styles.inkLight, margin: 0 }}>{proposal.description}</p>
                      {voteBar(proposal)}
                      <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, letterSpacing: "0.06em", marginTop: "0.5rem" }}>
                        {proposal.yesVotes.toString()} YES · {proposal.noVotes.toString()} NO · {proposal.abstainVotes.toString()} ABSTAIN · QUORUM {proposal.quorumPercent.toString()}%
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                        {(["Yes", "No", "Abstain"] as const).map((choice) => (
                          <button
                            key={choice}
                            disabled={voting === proposal.id}
                            onClick={() => vote(proposal.id, { [choice]: null } as VoteChoice)}
                            style={{
                              padding: "0.4rem 0.8rem", background: "none",
                              border: `1px solid ${choice === "Yes" ? styles.sage : choice === "No" ? styles.rust : styles.rule}`,
                              color:  choice === "Yes" ? styles.sage : choice === "No" ? styles.rust : styles.inkLight,
                              fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
                              textTransform: "uppercase", cursor: "pointer",
                            }}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Polls tab ──────────────────────────────────────────────────────── */}
      {tab === "polls" && (
        <>
          {/* Create poll form */}
          {showPollForm && (
            <form onSubmit={handleCreatePoll} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Question (max 120 chars)</label>
                <input
                  style={inputStyle} maxLength={120} required
                  value={pollQuestion} onChange={(evt) => setPollQuestion(evt.target.value)}
                  placeholder="Should we move the meeting to Thursday?"
                />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Options (2–5)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={opt}
                        onChange={(evt) => {
                          const updated = [...pollOptions];
                          updated[idx] = evt.target.value;
                          setPollOptions(updated);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        required={idx < 2}
                      />
                      {pollOptions.length > 2 && (
                        <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          style={{ padding: "0 0.75rem", border: `1px solid ${styles.rule}`, background: "none", cursor: "pointer", fontFamily: styles.mono, fontSize: "0.7rem", color: styles.rust }}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button type="button" onClick={() => setPollOptions([...pollOptions, ""])}
                      style={{ padding: "0.4rem", border: `1px dashed ${styles.rule}`, background: "none", cursor: "pointer", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: styles.inkLight }}>
                      + Add option
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: styles.inkLight, marginBottom: "0.3rem" }}>Duration</label>
                  <select style={{ ...inputStyle, background: "#fff" }} value={pollDays} onChange={(evt) => setPollDays(evt.target.value as any)}>
                    <option value="1">24 hours</option>
                    <option value="2">48 hours</option>
                    <option value="7">7 days</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "1.4rem" }}>
                  <input type="checkbox" id="pollLive" checked={pollLive} onChange={(evt) => setPollLive(evt.target.checked)} />
                  <label htmlFor="pollLive" style={{ fontFamily: styles.sans, fontSize: "0.8rem" }}>Show live results</label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "1.4rem" }}>
                  <input type="checkbox" id="pollAnon" checked={pollAnon} onChange={(evt) => setPollAnon(evt.target.checked)} />
                  <label htmlFor="pollAnon" style={{ fontFamily: styles.sans, fontSize: "0.8rem" }}>Anonymous responses</label>
                </div>
              </div>
              <button type="submit" disabled={pollCreating} style={{ padding: "0.75rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
                {pollCreating ? "Creating…" : "Create Poll"}
              </button>
            </form>
          )}

          {polls.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO POLLS YET
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {polls.map((poll) => {
              const open = pollIsOpen(poll);
              const totalVotes = poll.options.reduce((sum, opt) => sum + Number(opt.votes), 0);
              const showResults = !open || poll.showLiveResults;
              return (
                <div key={poll.id} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div>
                      <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: open ? styles.sage : styles.inkLight, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                        {open ? "Open" : "Closed"}{poll.anonymous ? " · Anonymous" : ""}
                      </div>
                      <h3 style={{ fontFamily: styles.serif, fontWeight: 700, fontSize: "1.05rem", margin: 0 }}>{poll.question}</h3>
                    </div>
                    {open && (
                      <button onClick={() => handleClosePoll(poll.id)}
                        style={{ padding: "0.3rem 0.7rem", background: "none", border: `1px solid ${styles.rule}`, fontFamily: styles.mono, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", color: styles.inkLight }}>
                        Close
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {poll.options.map((option, idx) => (
                      <div key={idx}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                          <span style={{ fontFamily: styles.sans, fontSize: "0.875rem" }}>{option.text}</span>
                          {showResults && (
                            <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight }}>{option.votes.toString()} vote{option.votes !== BigInt(1) ? "s" : ""}</span>
                          )}
                        </div>
                        {showResults && pollOptionBar(option.votes, totalVotes)}
                        {open && (
                          <button
                            disabled={voting === poll.id}
                            onClick={() => votePoll(poll.id, idx)}
                            style={{ marginTop: "0.3rem", padding: "0.3rem 0.75rem", background: "none", border: `1px solid ${styles.navy}`, fontFamily: styles.mono, fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", color: styles.navy }}
                          >
                            Vote
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: styles.mono, fontSize: "0.58rem", color: styles.inkLight, letterSpacing: "0.06em", marginTop: "0.75rem" }}>
                    {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

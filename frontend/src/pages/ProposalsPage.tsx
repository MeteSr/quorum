import { useEffect, useState } from "react";
import { getAllProposals, castVote, type Proposal, type VoteChoice } from "@/services/governance";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F9F6F0",
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

function statusColor(status: Proposal["status"]): string {
  if ("Open"    in status) return S.sage;
  if ("Passed"  in status) return S.navy;
  if ("Failed"  in status) return S.rust;
  if ("Draft"   in status) return S.inkLight;
  return S.inkLight;
}

function statusLabel(status: Proposal["status"]): string {
  return Object.keys(status)[0].toUpperCase();
}

function voteBar(p: Proposal) {
  const total = Number(p.yesVotes + p.noVotes + p.abstainVotes) || 1;
  const yesPct = (Number(p.yesVotes)  / total) * 100;
  const noPct  = (Number(p.noVotes)   / total) * 100;
  return (
    <div style={{ display: "flex", height: 6, marginTop: "0.75rem", gap: 2 }}>
      <div style={{ width: `${yesPct}%`, background: S.sage }} />
      <div style={{ width: `${noPct}%`, background: S.rust }} />
      <div style={{ flex: 1, background: S.rule }} />
    </div>
  );
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [voting,    setVoting]    = useState<string | null>(null);

  useEffect(() => {
    getAllProposals().then(setProposals).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function vote(proposalId: string, choice: VoteChoice) {
    setVoting(proposalId);
    try {
      const result = await castVote(proposalId, choice);
      if ("ok" in result) {
        const updated = await getAllProposals();
        setProposals(updated);
      }
    } finally {
      setVoting(null);
    }
  }

  if (loading) return <p style={{ fontFamily: S.sans, color: S.inkLight }}>Loading proposals…</p>;

  return (
    <div>
      <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Proposals</h1>
      <p style={{ color: S.inkLight, fontFamily: S.sans, fontSize: "0.9rem", marginBottom: "2rem" }}>
        Active votes and governance history
      </p>

      {proposals.length === 0 && (
        <div style={{ padding: "3rem", border: `1px dashed ${S.rule}`, textAlign: "center", color: S.inkLight, fontFamily: S.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          NO PROPOSALS YET
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {proposals.map((p) => {
          const isOpen = "Open" in p.status;
          return (
            <div key={p.id} style={{ border: `1px solid ${S.rule}`, padding: "1.5rem", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: statusColor(p.status), textTransform: "uppercase", marginBottom: "0.4rem" }}>
                    {statusLabel(p.status)}
                  </div>
                  <h3 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", margin: "0 0 0.5rem" }}>{p.title}</h3>
                  <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, margin: 0 }}>{p.description}</p>
                  {voteBar(p)}
                  <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.06em", marginTop: "0.5rem" }}>
                    {p.yesVotes.toString()} YES · {p.noVotes.toString()} NO · {p.abstainVotes.toString()} ABSTAIN · QUORUM {p.quorumPercent.toString()}%
                  </div>
                </div>
                {isOpen && (
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    {(["Yes", "No", "Abstain"] as const).map((choice) => (
                      <button
                        key={choice}
                        disabled={voting === p.id}
                        onClick={() => vote(p.id, { [choice]: null } as VoteChoice)}
                        style={{
                          padding: "0.4rem 0.8rem", background: "none",
                          border: `1px solid ${choice === "Yes" ? S.sage : choice === "No" ? S.rust : S.rule}`,
                          color:  choice === "Yes" ? S.sage : choice === "No" ? S.rust : S.inkLight,
                          fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
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
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerMember } from "@/services/members";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F9F6F0",
  navy:     "#1B2D4F",
  rule:     "#C8C3B8",
  rust:     "#C94C2E",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

const inputStyle = {
  width: "100%", padding: "0.625rem 0.75rem", border: `1px solid ${S.rule}`,
  fontFamily: S.sans, fontSize: "0.875rem", outline: "none", background: "#fff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block", fontFamily: S.mono, fontSize: "0.6rem",
  letterSpacing: "0.1em", textTransform: "uppercase" as const,
  color: S.inkLight, marginBottom: "0.35rem",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [unitId,      setUnitId]      = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email,       setEmail]       = useState("");
  const [inviteCode,  setInviteCode]  = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await registerMember(unitId.trim(), displayName.trim(), email.trim(), inviteCode.trim());
      if ("err" in result) {
        const err = result.err;
        if ("InvalidCode" in err)   setError(`Invalid invite code: ${err.InvalidCode}`);
        else if ("AlreadyExists" in err) setError("You are already registered.");
        else if ("InvalidInput"  in err) setError(err.InvalidInput);
        else setError("Registration failed. Please try again.");
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, padding: "3rem", border: `1px solid ${S.rule}`, background: "#fff" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.15em", color: S.navy, marginBottom: "0.5rem" }}>
          QUORUM
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", margin: "0 0 0.4rem" }}>
          Join your community
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "2rem" }}>
          Enter your invite code to complete registration.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={labelStyle}>Invite Code</label>
            <input style={inputStyle} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="e.g. LAKEWOOD-2025" required />
          </div>
          <div>
            <label style={labelStyle}>Unit / Address</label>
            <input style={inputStyle} value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="e.g. 42B" required />
          </div>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Smith" required />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" required />
          </div>

          {error && (
            <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.rust, margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.875rem", background: loading ? S.inkLight : S.navy, color: "#fff",
              border: "none", fontFamily: S.mono, fontSize: "0.7rem",
              letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Registering…" : "Complete Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}

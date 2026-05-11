import { useAuth } from "@/context/AuthContext";

const S = {
  ink:      "#0E0E0C",
  paper:    "#F9F6F0",
  navy:     "#1B2D4F",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

export default function LoginPage() {
  const { login, devLogin } = useAuth();
  const isDev = import.meta.env.DEV;

  return (
    <div style={{ minHeight: "100vh", background: S.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 400, padding: "3rem", border: `1px solid ${S.rule}`, background: "#fff" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.15em", color: S.navy, marginBottom: "0.5rem" }}>
          QUORUM
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", margin: "0 0 0.5rem" }}>
          Sign in
        </h1>
        <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight, marginBottom: "2.5rem" }}>
          On-chain HOA governance. Authenticate with your Internet Identity.
        </p>

        <button
          onClick={login}
          style={{
            width: "100%", padding: "0.875rem", background: S.navy, color: "#fff",
            border: "none", fontFamily: S.mono, fontSize: "0.7rem",
            letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", marginBottom: "1rem",
          }}
        >
          Sign in with Internet Identity
        </button>

        {isDev && (
          <button
            onClick={devLogin}
            style={{
              width: "100%", padding: "0.875rem", background: "none", color: S.inkLight,
              border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.65rem",
              letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            Dev login (local only)
          </button>
        )}
      </div>
    </div>
  );
}

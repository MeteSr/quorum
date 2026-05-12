import { usePWAInstall } from "@/hooks/usePWAInstall";

const S = {
  navy:  "#1B2D4F",
  paper: "#F9F6F0",
  rule:  "#C8C3B8",
  mono:  "'IBM Plex Mono', monospace",
  sans:  "'IBM Plex Sans', sans-serif",
};

export default function PWAInstallBanner() {
  const { showBanner, triggerInstall, dismissBanner } = usePWAInstall();

  if (!showBanner) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: S.navy, color: S.paper,
      padding: "0.75rem 1.5rem",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "1rem", zIndex: 200,
      borderTop: `1px solid rgba(255,255,255,0.15)`,
    }}>
      <span style={{ fontFamily: S.sans, fontSize: "0.85rem" }}>
        Add Quorum to your home screen for the full app experience.
      </span>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          onClick={triggerInstall}
          style={{
            background: S.paper, color: S.navy,
            border: "none", fontFamily: S.mono, fontSize: "0.62rem",
            letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "0.4rem 0.9rem", cursor: "pointer", minHeight: 44,
          }}
        >
          Install
        </button>
        <button
          onClick={dismissBanner}
          style={{
            background: "none", color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.2)", fontFamily: S.mono,
            fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "0.4rem 0.75rem", cursor: "pointer", minHeight: 44,
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

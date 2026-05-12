import { useEffect, useState } from "react";

const SESSION_KEY = "quorum_session_count";

function getSessionCount(): number {
  try {
    return parseInt(localStorage.getItem(SESSION_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function incrementSession(): number {
  try {
    const next = getSessionCount() + 1;
    localStorage.setItem(SESSION_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState<Event | null>(null);
  const [showBanner,  setShowBanner]  = useState(false);
  const [installed,   setInstalled]   = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const sessionCount = incrementSession();

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
      if (sessionCount >= 3) setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function triggerInstall() {
    if (!promptEvent) return;
    (promptEvent as any).prompt();
    const { outcome } = await (promptEvent as any).userChoice;
    if (outcome === "accepted") setInstalled(true);
    setShowBanner(false);
    setPromptEvent(null);
  }

  function dismissBanner() {
    setShowBanner(false);
  }

  return { showBanner: showBanner && !installed, triggerInstall, dismissBanner };
}

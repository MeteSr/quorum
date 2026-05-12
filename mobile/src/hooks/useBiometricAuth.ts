import { useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, AppStateStatus } from "react-native";

type BiometricState = "idle" | "authenticated" | "failed" | "unavailable";

export function useBiometricAuth(enabled: boolean) {
  const [state, setState] = useState<BiometricState>("idle");

  const authenticate = useCallback(async () => {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hardware || !enrolled) {
      setState("unavailable");
      return true; // no biometric hardware → allow through
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Quorum",
      fallbackLabel: "Use Passcode",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    if (result.success) {
      setState("authenticated");
      return true;
    }
    setState("failed");
    return false;
  }, []);

  // Re-prompt on foreground if the app was backgrounded.
  useEffect(() => {
    if (!enabled) return;

    let lastBackground = 0;
    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "background") {
        lastBackground = Date.now();
      } else if (status === "active" && lastBackground > 0) {
        // Require re-auth if backgrounded for more than 60 s.
        if (Date.now() - lastBackground > 60_000) {
          setState("idle");
          authenticate();
        }
      }
    });
    // Trigger on mount.
    authenticate();
    return () => sub.remove();
  }, [enabled, authenticate]);

  return { state, authenticate };
}
